package pilot.olap;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * 파일럿용 가상 제조 실적 데이터. DuckDB 전용이며 운영 전환 시에는 쓰지 않는다.
 * 팩트 테이블이 없을 때만 만든다. 값은 hash() 기반이라 매번 같은 데이터가 나온다.
 *
 * 실제 데이터를 쓰려면 같은 컬럼 구성의 CSV를 만들어 아래처럼 적재하면 된다.
 *   CREATE TABLE FACT_PROD_DAILY AS SELECT * FROM read_csv('fact.csv');
 */
public final class SampleData {

    private SampleData() {
    }

    public static void ensure(Connection con) throws SQLException {
        try (Statement st = con.createStatement()) {
            try (ResultSet rs = st.executeQuery(
                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'FACT_PROD_DAILY'")) {
                rs.next();
                if (rs.getInt(1) > 0) {
                    return;
                }
            }
            st.execute(String.join("\n",
                "CREATE TABLE FACT_PROD_DAILY AS",
                "WITH days AS (",
                "  SELECT CAST(d AS DATE) AS d",
                "  FROM generate_series(DATE '2026-05-01', DATE '2026-10-31', INTERVAL 1 DAY) t(d)",
                "), plants AS (",
                "  SELECT * FROM (VALUES ('1공장', 'P1'), ('2공장', 'P2')) t(plant, pcode)",
                "), lines AS (",
                "  SELECT * FROM (VALUES (1), (2), (3)) t(line_no)",
                "), procs AS (",
                "  SELECT * FROM (VALUES ('사출', 1), ('조립', 2), ('도장', 3), ('검사', 4)) t(process, proc_no)",
                "), equips AS (",
                "  SELECT * FROM (VALUES (1), (2), (3)) t(equip_no)",
                "), shifts AS (",
                "  SELECT * FROM (VALUES ('주간'), ('야간')) t(shift)",
                "), products AS (",
                "  SELECT * FROM (VALUES",
                "    ('A군', 'A-100', 1), ('A군', 'A-200', 2), ('A군', 'A-300', 3),",
                "    ('B군', 'B-100', 1), ('B군', 'B-200', 2), ('B군', 'B-300', 3),",
                "    ('C군', 'C-100', 1), ('C군', 'C-200', 2), ('C군', 'C-300', 3)",
                "  ) t(pgroup, product, line_no)",
                "), base AS (",
                "  SELECT d, plant, pcode, l.line_no, process, proc_no, equip_no, shift, pgroup, product,",
                "         (hash(d, pcode, l.line_no, proc_no, equip_no, shift, product) % 10000) / 10000.0 AS r1,",
                "         (hash(product, shift, equip_no, proc_no, l.line_no, pcode, d, 7) % 10000) / 10000.0 AS r2,",
                "         (hash(pcode, d, product, 13, shift, equip_no, proc_no, l.line_no) % 10000) / 10000.0 AS r3",
                "  FROM days, plants, lines l, procs, equips, shifts, products p",
                "  WHERE p.line_no = l.line_no",
                "), calc AS (",
                "  SELECT *,",
                "         CAST(160 AS INTEGER) AS plan_min,",
                "         CAST(round(160 * least(1.0, 0.70 + 0.28 * r1",
                "              - CASE WHEN shift = '야간' THEN 0.06 ELSE 0 END",
                "              - CASE WHEN pcode = 'P2' AND line_no = 3 THEN 0.10 ELSE 0 END)) AS INTEGER) AS run_min",
                "  FROM base",
                "), qty AS (",
                "  SELECT *, CAST(round(run_min * (2.0 + 0.5 * proc_no + r2)) AS INTEGER) AS prod_qty",
                "  FROM calc",
                ")",
                "SELECT strftime(d, '%Y-%m')        AS WORK_MONTH,",
                "       strftime(d, '%G-W%V')       AS WORK_WEEK,",
                "       strftime(d, '%Y-%m-%d')     AS WORK_DATE,",
                "       plant                       AS PLANT,",
                "       pcode || '-L' || line_no    AS LINE,",
                "       process                     AS PROCESS,",
                "       pcode || '-L' || line_no || '-' || process || '-' || equip_no AS EQUIP,",
                "       pgroup                      AS PRODUCT_GROUP,",
                "       product                     AS PRODUCT,",
                "       shift                       AS SHIFT,",
                "       prod_qty                    AS PROD_QTY,",
                "       prod_qty - defect_qty       AS GOOD_QTY,",
                "       defect_qty                  AS DEFECT_QTY,",
                "       plan_min                    AS PLAN_MIN,",
                "       run_min                     AS RUN_MIN",
                "FROM (",
                "  SELECT *, CAST(round(prod_qty * (0.01 + 0.04 * r3",
                "              + CASE WHEN process = '도장' THEN 0.03 ELSE 0 END",
                "              + CASE WHEN pgroup = 'C군' THEN 0.02 ELSE 0 END)) AS INTEGER) AS defect_qty",
                "  FROM qty",
                ")"));
        }
    }
}
