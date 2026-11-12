package pilot.olap;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** SQL을 실행해 화면용 응답으로 바꾼다. */
public final class PivotService {

    /** 한 번에 내려보내는 집계 행 상한. 넘으면 truncated=true로 알린다. */
    public static final int MAX_PIVOT_ROWS = 100_000;
    public static final int MAX_MEMBERS = 5_000;
    public static final int MAX_DETAIL_ROWS = 500;

    /** DB 연결 공급자. 운영에서는 기존 서버의 커넥션 풀(DataSource)을 연결한다. */
    public interface ConnectionSource {
        Connection get() throws SQLException;
    }

    private final Meta meta;
    private final PivotQueryBuilder builder;
    private final ConnectionSource connections;

    public PivotService(Meta meta, SqlDialect dialect, ConnectionSource connections) {
        this.meta = meta;
        this.builder = new PivotQueryBuilder(meta, dialect);
        this.connections = connections;
    }

    public Meta meta() {
        return meta;
    }

    /**
     * 응답의 cells 한 행: [행 깊이, 열 깊이, 행 차원 값..., 열 차원 값..., 측정값...]
     * 깊이는 그 행이 몇 번째 차원까지 묶인 집계인지를 뜻한다(0이면 그 축의 총계).
     */
    public Map<String, Object> pivot(PivotRequest req) throws SQLException {
        int nRows = req.rows == null ? 0 : req.rows.size();
        int nCols = req.cols == null ? 0 : req.cols.size();
        int nDims = nRows + nCols;
        PivotQueryBuilder.Built q = builder.buildPivot(req, MAX_PIVOT_ROWS + 1);
        int nMeasures = req.measures.size();

        long started = System.nanoTime();
        List<Object[]> cells = new ArrayList<>();
        boolean truncated = false;
        try (Connection con = connections.get();
             PreparedStatement ps = prepare(con, q);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                if (cells.size() == MAX_PIVOT_ROWS) {
                    truncated = true;
                    break;
                }
                Object[] cell = new Object[2 + nDims + nMeasures];
                int rowDepth = 0;
                int colDepth = 0;
                for (int i = 0; i < nDims; i++) {
                    boolean grouped = rs.getInt(nDims + 1 + i) == 0;
                    if (grouped) {
                        cell[2 + i] = rs.getString(1 + i);
                        if (i < nRows) {
                            rowDepth++;
                        } else {
                            colDepth++;
                        }
                    }
                }
                cell[0] = rowDepth;
                cell[1] = colDepth;
                for (int m = 0; m < nMeasures; m++) {
                    double v = rs.getDouble(2 * nDims + 1 + m);
                    cell[2 + nDims + m] = rs.wasNull() ? null : v;
                }
                cells.add(cell);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cells", cells);
        out.put("truncated", truncated);
        out.put("elapsedMs", (System.nanoTime() - started) / 1_000_000);
        out.put("sql", q.sql);
        out.put("params", q.params);
        return out;
    }

    public List<String> members(String dimId) throws SQLException {
        PivotQueryBuilder.Built q = builder.buildMembers(dimId, MAX_MEMBERS);
        List<String> out = new ArrayList<>();
        try (Connection con = connections.get();
             PreparedStatement ps = prepare(con, q);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                out.add(rs.getString(1));
            }
        }
        return out;
    }

    public Map<String, Object> detail(PivotRequest req) throws SQLException {
        PivotQueryBuilder.Built q = builder.buildDetail(req, MAX_DETAIL_ROWS + 1);
        List<String> labels = builder.detailLabels();
        List<Object[]> rows = new ArrayList<>();
        boolean truncated = false;
        try (Connection con = connections.get();
             PreparedStatement ps = prepare(con, q);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                if (rows.size() == MAX_DETAIL_ROWS) {
                    truncated = true;
                    break;
                }
                Object[] row = new Object[labels.size()];
                for (int i = 0; i < row.length; i++) {
                    Object v = rs.getObject(i + 1);
                    row[i] = v instanceof Number ? v : (v == null ? null : v.toString());
                }
                rows.add(row);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("columns", labels);
        out.put("rows", rows);
        out.put("truncated", truncated);
        return out;
    }

    private static PreparedStatement prepare(Connection con, PivotQueryBuilder.Built q) throws SQLException {
        PreparedStatement ps = con.prepareStatement(q.sql);
        for (int i = 0; i < q.params.size(); i++) {
            ps.setObject(i + 1, q.params.get(i));
        }
        return ps;
    }
}
