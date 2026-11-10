// [IOSTAR-PM] 기준정보: 대한민국 공휴일
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
function getKoreanNationalHolidays(startYear, endYear) {
  const holidays = [];
  for (let y = startYear; y <= endYear; y++) {
    holidays.push({ type: "NATIONAL", name: "신정", date: `${y}-01-01` });
    holidays.push({ type: "NATIONAL", name: "삼일절", date: `${y}-03-01` });
    holidays.push({ type: "NATIONAL", name: "어린이날", date: `${y}-05-05` });
    holidays.push({ type: "NATIONAL", name: "현충일", date: `${y}-06-06` });
    holidays.push({ type: "NATIONAL", name: "광복절", date: `${y}-08-15` });
    holidays.push({ type: "NATIONAL", name: "개천절", date: `${y}-10-03` });
    holidays.push({ type: "NATIONAL", name: "한글날", date: `${y}-10-09` });
    holidays.push({ type: "NATIONAL", name: "성탄절", date: `${y}-12-25` });

    if (y === 2025) {
      holidays.push({ type: "NATIONAL", name: "설날 연휴", date: "2025-01-28" });
      holidays.push({ type: "NATIONAL", name: "설날", date: "2025-01-29" });
      holidays.push({ type: "NATIONAL", name: "설날 연휴", date: "2025-01-30" });
      holidays.push({ type: "NATIONAL", name: "부처님오신날", date: "2025-05-05" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(부처님오신날)", date: "2025-05-06" });
      holidays.push({ type: "NATIONAL", name: "추석 연휴", date: "2025-10-05" });
      holidays.push({ type: "NATIONAL", name: "추석", date: "2025-10-06" });
      holidays.push({ type: "NATIONAL", name: "추석 연휴", date: "2025-10-07" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(추석)", date: "2025-10-08" });
    } else if (y === 2026) {
      holidays.push({ type: "NATIONAL", name: "설날 연휴", date: "2026-02-16" });
      holidays.push({ type: "NATIONAL", name: "설날", date: "2026-02-17" });
      holidays.push({ type: "NATIONAL", name: "설날 연휴", date: "2026-02-18" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(삼일절)", date: "2026-03-02" });
      holidays.push({ type: "NATIONAL", name: "부처님오신날", date: "2026-05-24" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(부처님오신날)", date: "2026-05-25" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(광복절)", date: "2026-08-17" });
      holidays.push({ type: "NATIONAL", name: "추석 연휴", date: "2026-09-24" });
      holidays.push({ type: "NATIONAL", name: "추석", date: "2026-09-25" });
      holidays.push({ type: "NATIONAL", name: "추석 연휴", date: "2026-09-26" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(개천절)", date: "2026-10-05" });
    } else if (y === 2027) {
      holidays.push({ type: "NATIONAL", name: "설날 연휴", date: "2027-02-06" });
      holidays.push({ type: "NATIONAL", name: "설날", date: "2027-02-07" });
      holidays.push({ type: "NATIONAL", name: "설날 연휴", date: "2027-02-08" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(설날)", date: "2027-02-09" });
      holidays.push({ type: "NATIONAL", name: "부처님오신날", date: "2027-05-13" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(광복절)", date: "2027-08-16" });
      holidays.push({ type: "NATIONAL", name: "추석 연휴", date: "2027-09-14" });
      holidays.push({ type: "NATIONAL", name: "추석", date: "2027-09-15" });
      holidays.push({ type: "NATIONAL", name: "추석 연휴", date: "2027-09-16" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(개천절)", date: "2027-10-04" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(한글날)", date: "2027-10-11" });
    }
  }
  return holidays;
}

function updateKoreanHolidays(showAlert = false) {
  const customHolidays = projectConfig.holidays.filter(h => h.type === "CUSTOM");
  const startY = new Date(projectConfig.projectStartDate).getFullYear() || 2026;
  const endY = new Date(projectConfig.projectEndDate).getFullYear() || 2026;

  const national = getKoreanNationalHolidays(Math.min(startY, endY), Math.max(startY, endY));

  const merged = [...customHolidays];
  national.forEach(nh => {
    if (!merged.some(m => m.date === nh.date)) {
      merged.push(nh);
    }
  });

  merged.sort((a, b) => a.date.localeCompare(b.date));
  projectConfig.holidays = merged;

  renderHolidays();
  rebuildAll();
  if (showAlert) showToast(`대한민국 법정공휴일이 프로젝트 기간(${startY}~${endY}년)에 맞춰 자동 재등록되었습니다.`);
}
