# 개발환경 및 설치·실행 가이드

## 1. 필요한 것

| 구분 | 항목 | 버전 | 비고 |
|---|---|---|---|
| 실행 | JDK 또는 JRE | 11 이상 (OpenJDK) | 실행만 할 PC에는 이것만 있으면 됨 |
| 빌드 | Maven | 3.6.3 이상 | 빌드할 PC에만 필요 |
| 화면 | 브라우저 | Edge 또는 Chrome 최신 | Internet Explorer는 지원하지 않음 |
| 선택 | DuckDB CLI | 최신 | 실제 데이터를 적재할 때만 필요 |
| 선택 | IDE | IntelliJ IDEA, Eclipse 등 | Maven 프로젝트로 열면 됨 |

OS는 Windows, Linux, macOS 모두 가능합니다. DB 서버 설치는 필요 없습니다(DuckDB는 파일 하나로 동작).

설치 확인:

```bash
java -version
```

```bash
mvn -version
```

## 2. 소스 받기

```bash
git clone -b claude/vibrant-euler-g6wez3 https://github.com/iosstar71/ioagent2.git
```

```bash
cd ioagent2/olap-pilot
```

## 3. 빌드

```bash
mvn package
```

- 처음 빌드할 때 Maven이 의존 라이브러리를 인터넷에서 내려받습니다.
- 테스트 7건이 함께 실행되고, 성공하면 `target/olap-pilot-0.1.0.jar`(약 80MB)가 만들어집니다.
- 이 jar 하나에 서버, 화면, DuckDB가 모두 들어 있습니다.

## 4. 실행

```bash
java -jar target/olap-pilot-0.1.0.jar
```

- 브라우저에서 `http://localhost:8080`을 엽니다.
- 첫 실행 때 `data/pilot.duckdb` 파일에 샘플 데이터를 만듭니다(수 초).
- 종료는 실행한 창에서 `Ctrl+C`입니다.

포트와 DB 파일 위치를 바꾸려면 인자를 줍니다(순서: 포트, DB 파일).

```bash
java -jar target/olap-pilot-0.1.0.jar 9000 data/my.duckdb
```

`run.sh`(Linux/macOS)와 `run.bat`(Windows)은 jar가 없으면 빌드한 뒤 실행해 주는 스크립트입니다. 같은 인자를 받습니다.

## 5. 폐쇄망 PC에 설치하기

인터넷이 되는 PC에서 빌드한 뒤 결과물만 옮기는 방법이 가장 간단합니다.

1. 인터넷 PC에서 `mvn package`로 jar를 만듭니다.
2. `target/olap-pilot-0.1.0.jar`를 폐쇄망 PC로 복사합니다.
3. 폐쇄망 PC에 JDK/JRE 11 이상이 있는지 확인하고, 4번의 명령으로 실행합니다.

폐쇄망 PC에는 Maven도 소스도 필요 없습니다. 폐쇄망에서 직접 빌드해야 한다면 사내 Maven 저장소(Nexus 등)에 `duckdb_jdbc`, `gson`, `junit-jupiter`와 빌드 플러그인을 등록해야 합니다.

## 6. 개발하기

- **IDE에서 열기**: `olap-pilot/pom.xml`을 Maven 프로젝트로 엽니다. 프로젝트 JDK는 11 이상으로 지정합니다.
- **IDE에서 실행**: `pilot.olap.Main` 클래스를 실행합니다. 작업 디렉터리를 `olap-pilot`으로 두면 `data/` 아래에 DB 파일이 생깁니다.
- **테스트**: `mvn test`
- **화면 수정**: `src/main/resources/web/`의 파일을 고칩니다. 화면 파일은 jar 안에서 읽으므로, 고친 뒤 다시 빌드하고 서버를 재시작해야 반영됩니다.
- **차원·측정값 변경**: `src/main/resources/pivot-meta.json`을 고친 뒤 다시 빌드합니다.

## 7. 실제 데이터 넣기

서버를 **종료한 상태**에서 DuckDB CLI로 DB 파일을 열어 적재합니다.

```bash
duckdb data/pilot.duckdb
```

```sql
DROP TABLE IF EXISTS FACT_PROD_DAILY;
CREATE TABLE FACT_PROD_DAILY AS SELECT * FROM read_csv('fact.csv');
```

- CSV의 컬럼명이 `pivot-meta.json`에 적힌 컬럼명과 같아야 합니다. 다르면 메타 쪽을 고칩니다.
- 차원 컬럼은 문자열이어야 하고, 날짜는 `YYYY-MM-DD` 형식의 문자열로 준비합니다.
- 샘플 데이터로 되돌리려면 `data/pilot.duckdb` 파일을 지우고 서버를 다시 실행합니다.

## 8. 문제 해결

| 증상 | 원인과 조치 |
|---|---|
| `Address already in use` | 포트가 사용 중입니다. 다른 포트를 인자로 줍니다. |
| DB 파일을 열 수 없다는 오류 | 다른 프로세스(이전 서버, DuckDB CLI)가 같은 파일을 열고 있습니다. 그쪽을 종료합니다. |
| 다른 PC에서 접속이 안 됨 | 파일럿은 인증이 없어 `127.0.0.1`에서만 접속되게 막아 두었습니다. 실행한 PC의 브라우저로 엽니다. |
| 빌드 중 내려받기 실패 | 프록시 환경이면 Maven `settings.xml`에 프록시를 설정합니다. |
| 화면을 고쳤는데 그대로임 | 다시 빌드하고 서버를 재시작했는지 확인합니다. |
| 시작 시 네이티브 라이브러리 오류 | DuckDB는 임시 폴더에 네이티브 라이브러리를 풀어 씁니다. 보안 정책이 임시 폴더 실행을 막는지 확인합니다. |

## 9. 검증 범위

- 빌드와 테스트는 Linux + OpenJDK 21에서 Java 11 대상(`--release 11`)으로 수행했습니다. JDK 11 자체에서의 실행과 Windows에서의 실행은 직접 확인하지 않았습니다.
- 브라우저 동작은 Chromium에서 확인했습니다.
