# -*- coding: utf-8 -*-
"""
[IOSTAR-PM 공용] HTTPS 인증서 생성기 (파이썬 표준 라이브러리만 사용, OpenSSL 불필요)

폐쇄망 PC 에 OpenSSL 이 없어도 HTTPS 를 켤 수 있도록 다음 파일을 만듭니다.
  certs/ca.crt      사내 전용 인증기관(CA) 인증서  → 접속하는 PC 의 [신뢰할 수 있는 루트 인증 기관]에 설치
  certs/ca.key      CA 개인키 (서버 PC 에만 보관, 외부 반출 금지)
  certs/server.crt  서버 인증서 (CA 서명, 유효기간 397일)
  certs/server.key  서버 개인키 (서버 PC 에만 보관)

사용법 (프로그램 폴더에서):
    python tools/make_cert.py                         → 이 PC 이름 · IP · localhost 용 인증서
    python tools/make_cert.py --host 10.10.1.20 --host pms.company.local
    python tools/make_cert.py --renew                 → 기존 CA 를 유지하고 서버 인증서만 다시 발급
  또는 make_cert.bat 실행

※ 회사 인증기관(사내 PKI)에서 발급한 인증서가 있으면 그 인증서를 쓰는 것이 가장 좋습니다.
   run_server.bat 은 certs/server.crt + certs/server.key 가 있으면 자동으로 HTTPS 로 기동합니다.
"""
import argparse
import base64
import datetime
import hashlib
import ipaddress
import pathlib
import secrets
import socket
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
CERT_DIR = ROOT / "certs"

# ---------------------------------------------------------------------------
# RSA
# ---------------------------------------------------------------------------
_SMALL_PRIMES = [p for p in range(3, 2000, 2) if all(p % q for q in range(3, int(p ** 0.5) + 1, 2))]


def _is_probable_prime(n, rounds=40):
    if n < 2:
        return False
    for p in _SMALL_PRIMES:
        if n % p == 0:
            return n == p
    d, r = n - 1, 0
    while d % 2 == 0:
        d //= 2
        r += 1
    for _ in range(rounds):
        a = secrets.randbelow(n - 3) + 2
        x = pow(a, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def _gen_prime(bits, e):
    while True:
        c = secrets.randbits(bits) | (3 << (bits - 2)) | 1
        if _is_probable_prime(c) and (c - 1) % e != 0:
            return c


def gen_rsa(bits=2048, e=65537):
    while True:
        p, q = _gen_prime(bits // 2, e), _gen_prime(bits // 2, e)
        if p == q:
            continue
        n = p * q
        if n.bit_length() != bits:
            continue
        phi = (p - 1) * (q - 1)
        d = pow(e, -1, phi)
        return {"n": n, "e": e, "d": d, "p": p, "q": q, "dp": d % (p - 1), "dq": d % (q - 1), "qi": pow(q, -1, p)}


# ---------------------------------------------------------------------------
# DER (ASN.1)
# ---------------------------------------------------------------------------
def _len(n):
    if n < 0x80:
        return bytes([n])
    b = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(b)]) + b


def tlv(tag, content):
    return bytes([tag]) + _len(len(content)) + content


def der_int(v):
    b = v.to_bytes(max(1, (v.bit_length() + 8) // 8), "big", signed=False)
    if b[0] & 0x80:
        b = b"\x00" + b
    while len(b) > 1 and b[0] == 0 and not (b[1] & 0x80):
        b = b[1:]
    return tlv(0x02, b)


def der_seq(*items):
    return tlv(0x30, b"".join(items))


def der_set(*items):
    return tlv(0x31, b"".join(items))


def der_oid(oid):
    parts = [int(x) for x in oid.split(".")]
    out = bytes([40 * parts[0] + parts[1]])
    for p in parts[2:]:
        enc = [p & 0x7F]
        p >>= 7
        while p:
            enc.append(0x80 | (p & 0x7F))
            p >>= 7
        out += bytes(reversed(enc))
    return tlv(0x06, out)


def der_null():
    return b"\x05\x00"


def der_bool(v):
    return tlv(0x01, b"\xff" if v else b"\x00")


def der_bitstring(data, unused=0):
    return tlv(0x03, bytes([unused]) + data)


def der_octets(data):
    return tlv(0x04, data)


def der_utf8(s):
    return tlv(0x0C, s.encode("utf-8"))


def der_time(dt):
    if dt.year < 2050:
        return tlv(0x17, dt.strftime("%y%m%d%H%M%SZ").encode())
    return tlv(0x18, dt.strftime("%Y%m%d%H%M%SZ").encode())


def ctx_explicit(n, content):
    return tlv(0xA0 | n, content)


OID_RSA = "1.2.840.113549.1.1.1"
OID_SHA256_RSA = "1.2.840.113549.1.1.11"
OID_CN, OID_O, OID_OU = "2.5.4.3", "2.5.4.10", "2.5.4.11"
SHA256_DIGEST_INFO = bytes.fromhex("3031300d060960864801650304020105000420")


def name(cn, org="IOSTAR-PM", ou=""):
    rdns = [der_set(der_seq(der_oid(OID_O), der_utf8(org)))]
    if ou:
        rdns.append(der_set(der_seq(der_oid(OID_OU), der_utf8(ou))))
    rdns.append(der_set(der_seq(der_oid(OID_CN), der_utf8(cn))))
    return der_seq(*rdns)


def public_key_info(key):
    rsa_pub = der_seq(der_int(key["n"]), der_int(key["e"]))
    return der_seq(der_seq(der_oid(OID_RSA), der_null()), der_bitstring(rsa_pub)), rsa_pub


def sign(key, data):
    k = (key["n"].bit_length() + 7) // 8
    t = SHA256_DIGEST_INFO + hashlib.sha256(data).digest()
    em = b"\x00\x01" + b"\xff" * (k - len(t) - 3) + b"\x00" + t
    m = int.from_bytes(em, "big")
    # CRT 서명
    s1, s2 = pow(m, key["dp"], key["p"]), pow(m, key["dq"], key["q"])
    h = (key["qi"] * (s1 - s2)) % key["p"]
    s = s2 + h * key["q"]
    assert pow(s, key["e"], key["n"]) == m
    return s.to_bytes(k, "big")


def ext(oid, value, critical=False):
    items = [der_oid(oid)]
    if critical:
        items.append(der_bool(True))
    items.append(der_octets(value))
    return der_seq(*items)


def key_usage(bits):
    v = 0
    for b in bits:
        v |= 1 << (7 - b)
    data = bytes([v])
    unused = 0
    while unused < 7 and not (v >> unused) & 1:
        unused += 1
    return der_bitstring(data, unused)


def make_cert(subject_key, subject_name, issuer_key, issuer_name, days, is_ca, hosts=(), issuer_ski=None):
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0) - datetime.timedelta(minutes=5)
    spki, rsa_pub = public_key_info(subject_key)
    ski = hashlib.sha1(rsa_pub).digest()
    exts = [ext("2.5.29.19", der_seq(der_bool(True)) if is_ca else der_seq(), critical=True)]
    if is_ca:
        exts.append(ext("2.5.29.15", key_usage([0, 5, 6]), critical=True))  # digitalSignature, keyCertSign, cRLSign
    else:
        exts.append(ext("2.5.29.15", key_usage([0, 2]), critical=True))  # digitalSignature, keyEncipherment
        exts.append(ext("2.5.29.37", der_seq(der_oid("1.3.6.1.5.5.7.3.1"))))  # serverAuth
        gn = []
        for h in hosts:
            try:
                gn.append(tlv(0x87, ipaddress.ip_address(h).packed))
            except ValueError:
                gn.append(tlv(0x82, h.encode("ascii")))
        exts.append(ext("2.5.29.17", der_seq(*gn)))
    exts.append(ext("2.5.29.14", der_octets(ski)))
    if issuer_ski:
        exts.append(ext("2.5.29.35", der_seq(tlv(0x80, issuer_ski))))
    tbs = der_seq(
        ctx_explicit(0, der_int(2)),
        der_int(secrets.randbits(63) | (1 << 62)),
        der_seq(der_oid(OID_SHA256_RSA), der_null()),
        issuer_name,
        der_seq(der_time(now), der_time(now + datetime.timedelta(days=days))),
        subject_name,
        spki,
        ctx_explicit(3, der_seq(*exts)),
    )
    sig = sign(issuer_key, tbs)
    return der_seq(tbs, der_seq(der_oid(OID_SHA256_RSA), der_null()), der_bitstring(sig)), ski


def private_key_der(k):
    return der_seq(*[der_int(v) for v in (0, k["n"], k["e"], k["d"], k["p"], k["q"], k["dp"], k["dq"], k["qi"])])


def pem(label, der):
    b = base64.b64encode(der).decode()
    return f"-----BEGIN {label}-----\n" + "\n".join(b[i:i + 64] for i in range(0, len(b), 64)) + f"\n-----END {label}-----\n"


# ---------------------------------------------------------------------------
# 기존 CA 다시 읽기 (--renew)
# ---------------------------------------------------------------------------
def _read_der(path, label):
    txt = path.read_text(encoding="ascii")
    body = txt.split(f"-----BEGIN {label}-----")[1].split(f"-----END {label}-----")[0]
    return base64.b64decode("".join(body.split()))


def _parse(der, i=0):
    tag = der[i]
    ln = der[i + 1]
    j = i + 2
    if ln & 0x80:
        n = ln & 0x7F
        ln = int.from_bytes(der[j:j + n], "big")
        j += n
    return tag, der[j:j + ln], j + ln


def _children(content):
    out, i = [], 0
    while i < len(content):
        tag, val, i = _parse(content, i)
        out.append((tag, val))
    return out


def load_ca(cert_dir):
    kd = _read_der(cert_dir / "ca.key", "RSA PRIVATE KEY")
    vals = [int.from_bytes(v, "big") for _, v in _children(_parse(kd)[1])]
    key = dict(zip(("ver", "n", "e", "d", "p", "q", "dp", "dq", "qi"), vals))
    cd = _read_der(cert_dir / "ca.crt", "CERTIFICATE")
    tbs = _children(_children(_parse(cd)[1])[0][1])
    subject = tbs[5]
    subject_der = bytes([subject[0]]) + _len(len(subject[1])) + subject[1]
    spki = _children(tbs[6][1])
    rsa_pub = spki[1][1][1:]
    return key, subject_der, hashlib.sha1(rsa_pub).digest()


def default_hosts():
    hosts = ["localhost", "127.0.0.1"]
    try:
        hn = socket.gethostname()
        hosts.append(hn)
        for ip in socket.gethostbyname_ex(hn)[2]:
            if ip not in hosts:
                hosts.append(ip)
    except OSError:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        if ip not in hosts:
            hosts.append(ip)
    except OSError:
        pass
    return hosts


def main():
    ap = argparse.ArgumentParser(description="Create a local CA and an HTTPS server certificate (no OpenSSL needed)")
    ap.add_argument("--host", action="append", default=[], help="Server host name or IP to include (repeatable)")
    ap.add_argument("--out", default=str(CERT_DIR), help="Output folder (default: certs)")
    ap.add_argument("--renew", action="store_true", help="Keep the existing CA and issue a new server certificate")
    ap.add_argument("--org", default="IOSTAR-PM", help="Organization name in the certificate")
    args = ap.parse_args()

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    hosts = []
    for h in default_hosts() + args.host:
        if h and h not in hosts:
            hosts.append(h)

    if args.renew and (out / "ca.crt").exists() and (out / "ca.key").exists():
        ca_key, ca_name, ca_ski = load_ca(out)
        print("[*] Using existing CA: " + str(out / "ca.crt"))
    else:
        print("[*] Generating CA key (RSA 2048)... this can take a few seconds")
        ca_key = gen_rsa()
        ca_name = name("IOSTAR-PM Local CA " + datetime.date.today().strftime("%Y%m%d"), args.org, "Local Certificate Authority")
        ca_der, ca_ski = make_cert(ca_key, ca_name, ca_key, ca_name, 3650, True)
        (out / "ca.crt").write_text(pem("CERTIFICATE", ca_der), encoding="ascii")
        (out / "ca.key").write_text(pem("RSA PRIVATE KEY", private_key_der(ca_key)), encoding="ascii")

    print("[*] Generating server key (RSA 2048)...")
    srv_key = gen_rsa()
    srv_der, _ = make_cert(srv_key, name(hosts[-1] if len(hosts) > 2 else "localhost", args.org, "IOSTAR-PM Server"),
                           ca_key, ca_name, 397, False, hosts, ca_ski)
    (out / "server.crt").write_text(pem("CERTIFICATE", srv_der), encoding="ascii")
    (out / "server.key").write_text(pem("RSA PRIVATE KEY", private_key_der(srv_key)), encoding="ascii")
    print("[OK] Certificates created in " + str(out))
    print("     Hosts in certificate : " + ", ".join(hosts))
    print("     Server certificate   : server.crt / server.key (valid 397 days)")
    print("     Install on client PCs: ca.crt -> 'Trusted Root Certification Authorities'")
    print("     Keep ca.key and server.key on the server PC only.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
