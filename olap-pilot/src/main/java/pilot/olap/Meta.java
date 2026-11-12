package pilot.olap;

import com.google.gson.Gson;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 분석 대상(팩트 테이블, 차원, 측정값) 정의.
 *
 * 화면과 API는 여기 정의된 id만 주고받고, 실제 컬럼명은 서버만 안다.
 * 즉 이 메타가 SQL에 들어갈 수 있는 식별자의 화이트리스트다.
 * 운영에서는 JSON 파일 대신 Oracle의 메타 테이블에서 읽도록 바꾸면 된다.
 */
public final class Meta {

    private static final Pattern IDENT = Pattern.compile("[A-Za-z][A-Za-z0-9_]*");

    public String factTable;
    public List<Dimension> dimensions;
    public List<Measure> measures;

    private transient Map<String, Dimension> dimById;
    private transient Map<String, Measure> measureById;

    public static final class Dimension {
        public String id;
        public String label;
        public String column;
    }

    public static final class Measure {
        public String id;
        public String label;
        /** sum | count | ratio */
        public String type;
        public String column;
        public String numerator;
        public String denominator;
        /** int | pct */
        public String format;
    }

    public static Meta loadFromClasspath(String resource) throws IOException {
        try (InputStream in = Meta.class.getResourceAsStream(resource)) {
            if (in == null) {
                throw new IOException("메타 정의를 찾을 수 없습니다: " + resource);
            }
            try (Reader r = new InputStreamReader(in, StandardCharsets.UTF_8)) {
                return new Gson().fromJson(r, Meta.class).validated();
            }
        }
    }

    /** 메타에 적힌 테이블/컬럼명이 단순 식별자인지 확인하고 조회용 인덱스를 만든다. */
    public Meta validated() {
        requireIdent(factTable, "factTable");
        dimById = new LinkedHashMap<>();
        for (Dimension d : dimensions) {
            requireIdent(d.column, "dimension " + d.id);
            if (dimById.put(d.id, d) != null) {
                throw new IllegalStateException("차원 id 중복: " + d.id);
            }
        }
        measureById = new LinkedHashMap<>();
        for (Measure m : measures) {
            switch (m.type) {
                case "sum":
                    requireIdent(m.column, "measure " + m.id);
                    break;
                case "count":
                    break;
                case "ratio":
                    requireIdent(m.numerator, "measure " + m.id + " numerator");
                    requireIdent(m.denominator, "measure " + m.id + " denominator");
                    break;
                default:
                    throw new IllegalStateException("알 수 없는 측정값 유형: " + m.type);
            }
            if (measureById.put(m.id, m) != null) {
                throw new IllegalStateException("측정값 id 중복: " + m.id);
            }
        }
        return this;
    }

    public Dimension dimension(String id) {
        Dimension d = dimById.get(id);
        if (d == null) {
            throw new IllegalArgumentException("정의되지 않은 차원: " + id);
        }
        return d;
    }

    public Measure measure(String id) {
        Measure m = measureById.get(id);
        if (m == null) {
            throw new IllegalArgumentException("정의되지 않은 측정값: " + id);
        }
        return m;
    }

    private static void requireIdent(String s, String what) {
        if (s == null || !IDENT.matcher(s).matches()) {
            throw new IllegalStateException("메타 정의 오류(" + what + "): " + s);
        }
    }
}
