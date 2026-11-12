package pilot.olap;

import java.util.List;
import java.util.Map;

/** 화면이 보내는 피벗 배치. 모든 값은 메타의 id다. */
public final class PivotRequest {
    /** 행 축 차원 (바깥 → 안쪽 순서) */
    public List<String> rows;
    /** 열 축 차원 (바깥 → 안쪽 순서) */
    public List<String> cols;
    public List<String> measures;
    /** 차원 id → 포함할 값 목록 */
    public Map<String, List<String>> filters;
    /** 드릴스루 전용: 선택한 셀의 좌표 (차원 id → 값, null 허용) */
    public Map<String, String> coords;
}
