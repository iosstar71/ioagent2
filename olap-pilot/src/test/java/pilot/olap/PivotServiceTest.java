package pilot.olap;

import org.duckdb.DuckDBConnection;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PivotServiceTest {

    private static Connection root;
    private static PivotService service;
    private static Meta meta;

    @BeforeAll
    static void setUp() throws Exception {
        root = DriverManager.getConnection("jdbc:duckdb:");
        SampleData.ensure(root);
        meta = Meta.loadFromClasspath("/pivot-meta.json");
        service = new PivotService(meta, SqlDialect.DUCKDB, root.unwrap(DuckDBConnection.class)::duplicate);
    }

    @AfterAll
    static void tearDown() throws Exception {
        root.close();
    }

    private static PivotRequest request(List<String> rows, List<String> cols, String... measures) {
        PivotRequest req = new PivotRequest();
        req.rows = rows;
        req.cols = cols;
        req.measures = Arrays.asList(measures);
        return req;
    }

    @SuppressWarnings("unchecked")
    private static List<Object[]> cells(PivotRequest req) throws Exception {
        return (List<Object[]>) service.pivot(req).get("cells");
    }

    /** 행 깊이와 열 깊이가 모두 0인 셀이 전체 총계다. */
    private static double grandTotal(List<Object[]> cells, int measureIndex, int nDims) {
        for (Object[] c : cells) {
            if ((int) c[0] == 0 && (int) c[1] == 0) {
                return (double) c[2 + nDims + measureIndex];
            }
        }
        throw new AssertionError("총계 셀이 없습니다.");
    }

    private static double scalar(String sql) throws Exception {
        try (Statement st = root.createStatement(); var rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getDouble(1);
        }
    }

    @Test
    void 차원_순서를_바꿔도_총계는_같다() throws Exception {
        double expected = scalar("SELECT SUM(PROD_QTY) FROM FACT_PROD_DAILY");
        List<Object[]> abc = cells(request(List.of("plant", "line", "process"), List.of("month"), "prod_qty"));
        List<Object[]> cab = cells(request(List.of("process", "plant"), List.of("line", "month"), "prod_qty"));
        assertEquals(expected, grandTotal(abc, 0, 4));
        assertEquals(expected, grandTotal(cab, 0, 4));
    }

    @Test
    void 소계는_하위_값의_합과_같다() throws Exception {
        List<Object[]> cells = cells(request(List.of("plant", "line"), List.of(), "prod_qty"));
        double plantSum = 0;
        double lineSum = 0;
        for (Object[] c : cells) {
            if ((int) c[0] == 1) {
                plantSum += (double) c[4];
            } else if ((int) c[0] == 2) {
                lineSum += (double) c[4];
            }
        }
        double total = grandTotal(cells, 0, 2);
        assertEquals(total, plantSum);
        assertEquals(total, lineSum);
        // 공장 2개 + 라인 6개 + 총계 1개
        assertEquals(9, cells.size());
    }

    @Test
    void 비율_지표는_합계_수준에서_분자합_나누기_분모합으로_계산된다() throws Exception {
        double expected = scalar("SELECT SUM(GOOD_QTY) * 1.0 / SUM(PROD_QTY) FROM FACT_PROD_DAILY");
        List<Object[]> cells = cells(request(List.of("process"), List.of("shift"), "yield"));
        assertEquals(expected, grandTotal(cells, 0, 2), 1e-12);

        // 하위 수율의 단순 평균과는 달라야 한다(가중치가 다르므로).
        double avgOfParts = scalar(
                "SELECT AVG(y) FROM (SELECT SUM(GOOD_QTY) * 1.0 / SUM(PROD_QTY) AS y "
                        + "FROM FACT_PROD_DAILY GROUP BY PROCESS, SHIFT)");
        assertTrue(Math.abs(avgOfParts - expected) > 1e-9);
    }

    @Test
    void 필터는_바인드_변수로_적용된다() throws Exception {
        PivotRequest req = request(List.of("line"), List.of(), "prod_qty");
        req.filters = Map.of("plant", List.of("1공장"), "shift", List.of("주간"));
        Map<String, Object> res = service.pivot(req);
        String sql = (String) res.get("sql");
        assertFalse(sql.contains("1공장"));
        assertTrue(sql.contains("PLANT IN (?)"));
        double expected = scalar(
                "SELECT SUM(PROD_QTY) FROM FACT_PROD_DAILY WHERE PLANT = '1공장' AND SHIFT = '주간'");
        @SuppressWarnings("unchecked")
        List<Object[]> cells = (List<Object[]>) res.get("cells");
        assertEquals(expected, grandTotal(cells, 0, 1));
    }

    @Test
    void 드릴스루_행의_합은_셀_값과_같다() throws Exception {
        PivotRequest req = request(List.of(), List.of(), "prod_qty");
        req.coords = new java.util.HashMap<>();
        req.coords.put("equip", "P1-L1-사출-1");
        req.coords.put("date", "2026-06-15");
        Map<String, Object> res = service.detail(req);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = (List<Object[]>) res.get("rows");
        @SuppressWarnings("unchecked")
        int qtyIdx = ((List<String>) res.get("columns")).indexOf("생산량");
        double sum = rows.stream().mapToDouble(r -> ((Number) r[qtyIdx]).doubleValue()).sum();
        double expected = scalar("SELECT SUM(PROD_QTY) FROM FACT_PROD_DAILY "
                + "WHERE EQUIP = 'P1-L1-사출-1' AND WORK_DATE = '2026-06-15'");
        assertTrue(rows.size() > 0);
        assertEquals(expected, sum);
    }

    @Test
    void 메타에_없는_이름은_거부한다() {
        assertThrows(IllegalArgumentException.class,
                () -> service.pivot(request(List.of("PLANT; DROP TABLE X"), List.of(), "prod_qty")));
        assertThrows(IllegalArgumentException.class,
                () -> service.pivot(request(List.of("plant"), List.of(), "SUM(1)")));
        assertThrows(IllegalArgumentException.class,
                () -> service.pivot(request(List.of("plant"), List.of("plant"), "prod_qty")));
        assertThrows(IllegalArgumentException.class,
                () -> service.pivot(request(List.of("plant"), List.of())));
    }

    @Test
    void 오라클_방언은_행_제한_문법만_다르다() {
        PivotRequest req = request(List.of("plant"), List.of("month"), "prod_qty");
        String duck = new PivotQueryBuilder(meta, SqlDialect.DUCKDB).buildPivot(req, 10).sql;
        String ora = new PivotQueryBuilder(meta, SqlDialect.ORACLE).buildPivot(req, 10).sql;
        assertTrue(duck.endsWith("LIMIT 10"));
        assertTrue(ora.endsWith("FETCH FIRST 10 ROWS ONLY"));
        assertEquals(duck.replace("\nLIMIT 10", ""), ora.replace("\nFETCH FIRST 10 ROWS ONLY", ""));
    }
}
