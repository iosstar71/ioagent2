package pilot.olap;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 피벗 배치를 SQL로 바꾼다.
 *
 * 행 차원의 모든 접두사 × 열 차원의 모든 접두사를 GROUPING SETS로 한 번에 집계하므로
 * 소계와 총계가 한 쿼리에서 나오고, 비율 지표도 각 수준에서 SUM(분자)/SUM(분모)로 계산된다.
 * 차원 순서를 바꾸는 것은 GROUPING SETS 구성이 달라지는 것뿐이다.
 *
 * 식별자는 메타에서만 가져오고, 사용자 값은 전부 바인드 변수로 넘긴다.
 */
public final class PivotQueryBuilder {

    /** 행+열 차원 수 상한. GROUPING SETS 개수가 (행+1)×(열+1)로 늘어나는 것을 막는다. */
    public static final int MAX_AXIS_DIMS = 8;
    /** Oracle의 IN 목록 상한(1000)에 맞춘다. */
    public static final int MAX_FILTER_VALUES = 1000;

    public static final class Built {
        public final String sql;
        public final List<Object> params;

        Built(String sql, List<Object> params) {
            this.sql = sql;
            this.params = params;
        }
    }

    private final Meta meta;
    private final SqlDialect dialect;

    public PivotQueryBuilder(Meta meta, SqlDialect dialect) {
        this.meta = meta;
        this.dialect = dialect;
    }

    /**
     * 결과 컬럼 순서: 행 차원들, 열 차원들, 각 차원의 GROUPING 플래그, 측정값들.
     */
    public Built buildPivot(PivotRequest req, int maxRows) {
        List<String> rows = orEmpty(req.rows);
        List<String> cols = orEmpty(req.cols);
        List<String> measures = orEmpty(req.measures);
        if (measures.isEmpty()) {
            throw new IllegalArgumentException("측정값을 하나 이상 선택해야 합니다.");
        }
        if (rows.size() + cols.size() > MAX_AXIS_DIMS) {
            throw new IllegalArgumentException("행과 열에 놓을 수 있는 차원은 최대 " + MAX_AXIS_DIMS + "개입니다.");
        }
        Set<String> seen = new HashSet<>();
        List<String> axisCols = new ArrayList<>();
        for (String id : concat(rows, cols)) {
            if (!seen.add(id)) {
                throw new IllegalArgumentException("차원이 중복 배치되었습니다: " + id);
            }
            axisCols.add(meta.dimension(id).column);
        }

        StringBuilder sql = new StringBuilder("SELECT ");
        List<String> select = new ArrayList<>(axisCols);
        for (String c : axisCols) {
            select.add("GROUPING(" + c + ")");
        }
        Set<String> seenMeasures = new HashSet<>();
        for (String id : measures) {
            if (!seenMeasures.add(id)) {
                throw new IllegalArgumentException("측정값이 중복 선택되었습니다: " + id);
            }
            select.add(aggregate(meta.measure(id)));
        }
        sql.append(String.join(", ", select));
        sql.append("\nFROM ").append(meta.factTable);

        List<Object> params = new ArrayList<>();
        appendWhere(sql, params, req.filters, null);

        if (!axisCols.isEmpty()) {
            List<String> sets = new ArrayList<>();
            for (int r = rows.size(); r >= 0; r--) {
                for (int c = cols.size(); c >= 0; c--) {
                    List<String> set = new ArrayList<>(axisCols.subList(0, r));
                    set.addAll(axisCols.subList(rows.size(), rows.size() + c));
                    sets.add("(" + String.join(", ", set) + ")");
                }
            }
            sql.append("\nGROUP BY GROUPING SETS (").append(String.join(", ", sets)).append(")");
        }
        return new Built(dialect.limit(sql.toString(), maxRows), params);
    }

    /** 필터 팝업에 보여줄 차원 값 목록. */
    public Built buildMembers(String dimId, int maxRows) {
        String col = meta.dimension(dimId).column;
        String sql = "SELECT DISTINCT " + col + "\nFROM " + meta.factTable + "\nORDER BY 1";
        return new Built(dialect.limit(sql, maxRows), new ArrayList<>());
    }

    /** 셀 하나를 구성하는 원본 행(드릴스루). */
    public Built buildDetail(PivotRequest req, int maxRows) {
        List<String> select = new ArrayList<>();
        for (Meta.Dimension d : meta.dimensions) {
            select.add(d.column);
        }
        for (Meta.Measure m : meta.measures) {
            if ("sum".equals(m.type)) {
                select.add(m.column);
            }
        }
        StringBuilder sql = new StringBuilder("SELECT ").append(String.join(", ", select));
        sql.append("\nFROM ").append(meta.factTable);
        List<Object> params = new ArrayList<>();
        appendWhere(sql, params, req.filters, req.coords);
        sql.append("\nORDER BY ").append(String.join(", ", select.subList(0, meta.dimensions.size())));
        return new Built(dialect.limit(sql.toString(), maxRows), params);
    }

    /** 드릴스루 결과의 컬럼 표시명 (buildDetail의 SELECT 순서와 같다). */
    public List<String> detailLabels() {
        List<String> labels = new ArrayList<>();
        for (Meta.Dimension d : meta.dimensions) {
            labels.add(d.label);
        }
        for (Meta.Measure m : meta.measures) {
            if ("sum".equals(m.type)) {
                labels.add(m.label);
            }
        }
        return labels;
    }

    private static String aggregate(Meta.Measure m) {
        switch (m.type) {
            case "sum":
                return "SUM(" + m.column + ")";
            case "count":
                return "COUNT(*)";
            case "ratio":
                // 비율은 합산하지 않고, 각 집계 수준에서 분자 합 / 분모 합으로 다시 계산한다.
                return "SUM(" + m.numerator + ") / NULLIF(SUM(" + m.denominator + "), 0)";
            default:
                throw new IllegalStateException(m.type);
        }
    }

    private void appendWhere(StringBuilder sql, List<Object> params,
                             Map<String, List<String>> filters, Map<String, String> coords) {
        List<String> conds = new ArrayList<>();
        if (filters != null) {
            for (Map.Entry<String, List<String>> e : filters.entrySet()) {
                List<String> values = e.getValue();
                if (values == null) {
                    continue;
                }
                String col = meta.dimension(e.getKey()).column;
                if (values.isEmpty()) {
                    conds.add("1 = 0");
                    continue;
                }
                if (values.size() > MAX_FILTER_VALUES) {
                    throw new IllegalArgumentException(
                            "필터 값은 차원당 최대 " + MAX_FILTER_VALUES + "개까지 선택할 수 있습니다.");
                }
                StringBuilder in = new StringBuilder(col).append(" IN (");
                for (int i = 0; i < values.size(); i++) {
                    in.append(i == 0 ? "?" : ", ?");
                    params.add(values.get(i));
                }
                conds.add(in.append(")").toString());
            }
        }
        if (coords != null) {
            for (Map.Entry<String, String> e : coords.entrySet()) {
                String col = meta.dimension(e.getKey()).column;
                if (e.getValue() == null) {
                    conds.add(col + " IS NULL");
                } else {
                    conds.add(col + " = ?");
                    params.add(e.getValue());
                }
            }
        }
        if (!conds.isEmpty()) {
            sql.append("\nWHERE ").append(String.join("\n  AND ", conds));
        }
    }

    private static List<String> orEmpty(List<String> l) {
        return l == null ? new ArrayList<>() : l;
    }

    private static List<String> concat(List<String> a, List<String> b) {
        List<String> out = new ArrayList<>(a);
        out.addAll(b);
        return out;
    }
}
