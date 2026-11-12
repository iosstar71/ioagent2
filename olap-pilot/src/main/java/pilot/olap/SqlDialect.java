package pilot.olap;

/**
 * DB별 SQL 차이를 흡수하는 지점.
 * 피벗 SQL 자체(GROUP BY GROUPING SETS, GROUPING())는 표준 문법이라 공통이고,
 * 여기에는 DB마다 다른 부분만 둔다.
 */
public interface SqlDialect {

    /** 결과 행 수를 제한한 SQL을 돌려준다. */
    String limit(String sql, int maxRows);

    SqlDialect DUCKDB = (sql, maxRows) -> sql + "\nLIMIT " + maxRows;

    /** Oracle 12c 이상. 파일럿에서는 실행해 보지 않았으므로 전환 시 검증이 필요하다. */
    SqlDialect ORACLE = (sql, maxRows) -> sql + "\nFETCH FIRST " + maxRows + " ROWS ONLY";
}
