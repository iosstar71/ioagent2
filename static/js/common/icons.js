// =============================================================================
// [IOSTAR-PM] 선 아이콘 (Icons) — 화면의 이모지를 같은 모양의 선 아이콘(SVG)으로 바꿔 그림
// -----------------------------------------------------------------------------
//  - 아이콘은 이 파일 한곳에서 관리 (24×24, 선 1.6, 둥근 끝) — 시안 A 아이콘 + 같은 규칙으로 추가한 아이콘
//  - 단추 · 메뉴 · 제목 · 배지 · 알림 등 글 맨 앞의 이모지를 화면에 그릴 때 아이콘으로 바꿈
//    (프로그램이 만드는 화면 · 영어 화면에도 같이 적용, 입력 칸 · 선택 상자 · 사용자가 쓴 글 안쪽은 그대로)
//  - 아이콘 색은 글자색을 따르고, 상태 아이콘(완료 · 주의 · 위험 등)만 테마 색을 씀
// =============================================================================
var Icons = {
  MAP: {
 "📥": "<path d=\"M12 4V14.5M8 10.5L12 14.5L16 10.5\"/><path d=\"M4.5 16.5V19.5H19.5V16.5\"/>",
 "🔑": "<circle cx=\"8\" cy=\"14\" r=\"3.5\"/><path d=\"M10.8 11.5L19.5 4.5\"/><path d=\"M16.5 7L19 9.5\"/>",
 "🔍": "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"M16 16L20 20\"/>",
 "💾": "<path d=\"M5 4.5H16.5L19.5 7.5V19.5C19.5 20.05 19.05 20.5 18.5 20.5H5.5C4.95 20.5 4.5 20.05 4.5 19.5V5.5C4.5 4.95 4.95 4.5 5.5 4.5Z\"/><path d=\"M8 4.5V9.5H15V4.5\"/><rect x=\"8\" y=\"13.5\" width=\"8\" height=\"7\" rx=\"1\"/>",
 "🔄": "<path d=\"M20 11A8 8 0 0 0 6.3 5.3L4 7.5\"/><path d=\"M4 4V7.5H7.5\"/><path d=\"M4 13A8 8 0 0 0 17.7 18.7L20 16.5\"/><path d=\"M20 20V16.5H16.5\"/>",
 "⚡": "<path d=\"M13 2.5L4.5 13.5H12L11 21.5L19.5 10.5H12L13 2.5Z\"/>",
 "📦": "<path d=\"M12 3.5L20 7.5V16.5L12 20.5L4 16.5V7.5L12 3.5Z\"/><path d=\"M4 7.5L12 11.5L20 7.5M12 11.5V20.5\"/>",
 "🔔": "<path d=\"M6 17.5V10.5C6 7.2 8.7 4.5 12 4.5C15.3 4.5 18 7.2 18 10.5V17.5\"/><path d=\"M4 17.5H20\"/><path d=\"M10 19.8C10.5 20.6 11.2 21 12 21C12.8 21 13.5 20.6 14 19.8\"/>",
 "🎨": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><circle cx=\"9\" cy=\"9.5\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"14.5\" cy=\"9.5\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"8.5\" cy=\"14\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M14 14.5C15.5 14.5 16.5 15.5 16.5 17\"/>",
 "⚙": "<path d=\"M4 7H7M11 7H20M4 12H13M17 12H20M4 17H8M12 17H20\"/><circle cx=\"9\" cy=\"7\" r=\"2\"/><circle cx=\"15\" cy=\"12\" r=\"2\"/><circle cx=\"10\" cy=\"17\" r=\"2\"/>",
 "🗂": "<path d=\"M4 6.5C4 5.4 4.9 4.5 6 4.5H10L12 6.8H18C19.1 6.8 20 7.7 20 8.8V17.5C20 18.6 19.1 19.5 18 19.5H6C4.9 19.5 4 18.6 4 17.5V6.5Z\"/>",
 "⚖": "<path d=\"M12 4V20M7 20H17M5 8H19\"/><path d=\"M6 8L4 13.5H8L6 8Z\"/><path d=\"M18 8L16 13.5H20L18 8Z\"/>",
 "👤": "<circle cx=\"12\" cy=\"8.5\" r=\"3.5\"/><path d=\"M5 19.5C5 16.5 8 14.5 12 14.5C16 14.5 19 16.5 19 19.5\"/>",
 "🔒": "<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"9.5\" rx=\"2\"/><path d=\"M8 10.5V7.5C8 5.3 9.8 3.5 12 3.5C14.2 3.5 16 5.3 16 7.5V10.5\"/>",
 "🏠": "<path d=\"M3 10.5L12 3.5L21 10.5V19.5C21 20.05 20.55 20.5 20 20.5H4C3.45 20.5 3 20.05 3 19.5V10.5Z\"/><path d=\"M9.5 20.5V14.5C9.5 13.95 9.95 13.5 10.5 13.5H13.5C14.05 13.5 14.5 13.95 14.5 14.5V20.5\"/>",
 "📊": "<rect x=\"3.5\" y=\"3.5\" width=\"7\" height=\"9\" rx=\"1.5\"/><rect x=\"13.5\" y=\"3.5\" width=\"7\" height=\"5\" rx=\"1.5\"/><rect x=\"13.5\" y=\"11.5\" width=\"7\" height=\"9\" rx=\"1.5\"/><rect x=\"3.5\" y=\"15.5\" width=\"7\" height=\"5\" rx=\"1.5\"/>",
 "📈": "<path d=\"M4 19.5H20\"/><path d=\"M5.5 15.5L10 11L13.5 13.5L18.5 7.5\"/><path d=\"M15.5 7.5H18.5V10.5\"/>",
 "🗓": "<path d=\"M4 5.5V18.5H20\"/><rect x=\"6.5\" y=\"6.5\" width=\"7\" height=\"2.8\" rx=\"1.4\"/><rect x=\"10.5\" y=\"11.5\" width=\"8.5\" height=\"2.8\" rx=\"1.4\"/>",
 "📋": "<rect x=\"4\" y=\"4\" width=\"16\" height=\"4\" rx=\"1.2\"/><path d=\"M7 8V17.5H11M7 12.5H11\"/><rect x=\"11\" y=\"11\" width=\"9\" height=\"3\" rx=\"1\"/><rect x=\"11\" y=\"16\" width=\"9\" height=\"3\" rx=\"1\"/>",
 "📌": "<rect x=\"4.5\" y=\"3.5\" width=\"15\" height=\"17\" rx=\"2\"/><path d=\"M8.5 9.5L10.5 11.5L15.5 7\"/><path d=\"M8.5 15.5H15.5\"/>",
 "📣": "<path d=\"M4.5 6.5C4.5 5.4 5.4 4.5 6.5 4.5H17.5C18.6 4.5 19.5 5.4 19.5 6.5V14.5C19.5 15.6 18.6 16.5 17.5 16.5H9L5 20V6.5Z\"/><path d=\"M12 8.2V11.2\"/><circle cx=\"12\" cy=\"13.8\" r=\"0.8\" fill=\"currentColor\" stroke=\"none\"/>",
 "📑": "<path d=\"M4 6.5C4 5.4 4.9 4.5 6 4.5H10L12 6.8H18C19.1 6.8 20 7.7 20 8.8V17.5C20 18.6 19.1 19.5 18 19.5H6C4.9 19.5 4 18.6 4 17.5V6.5Z\"/>",
 "📝": "<path d=\"M6 3.5H14.5L18.5 7.5V19.5C18.5 20.05 18.05 20.5 17.5 20.5H6C5.45 20.5 5 20.05 5 19.5V4.5C5 3.95 5.45 3.5 6 3.5Z\"/><path d=\"M14 3.5V8H18.5M8.5 12H15M8.5 15.5H13\"/>",
 "📅": "<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"16\" rx=\"2\"/><path d=\"M8 2.8V6M16 2.8V6M3.5 9.5H20.5\"/>",
 "🔀": "<circle cx=\"6.5\" cy=\"6.5\" r=\"2.2\"/><circle cx=\"17.5\" cy=\"6.5\" r=\"2.2\"/><circle cx=\"12\" cy=\"18\" r=\"2.2\"/><path d=\"M6.5 8.7V11.5C6.5 13.2 8.5 14.2 12 14.2C15.5 14.2 17.5 13.2 17.5 11.5V8.7\"/><path d=\"M12 14.2V15.8\"/>",
 "📢": "<path d=\"M6 17.5V10.5C6 7.2 8.7 4.5 12 4.5C15.3 4.5 18 7.2 18 10.5V17.5\"/><path d=\"M4 17.5H20\"/><path d=\"M10 19.8C10.5 20.6 11.2 21 12 21C12.8 21 13.5 20.6 14 19.8\"/>",
 "✅": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M8.5 12.2L10.8 14.5L15.5 9.5\"/>",
 "⚠": "<path d=\"M12 4L20.5 19H3.5L12 4Z\"/><path d=\"M12 10V13.5\"/><circle cx=\"12\" cy=\"16.2\" r=\"0.7\" fill=\"currentColor\" stroke=\"none\"/>",
 "🎯": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><circle cx=\"12\" cy=\"12\" r=\"4.5\"/><circle cx=\"12\" cy=\"12\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/>",
 "💬": "<path d=\"M4.5 6.5C4.5 5.4 5.4 4.5 6.5 4.5H17.5C18.6 4.5 19.5 5.4 19.5 6.5V14.5C19.5 15.6 18.6 16.5 17.5 16.5H9L5 20V6.5Z\"/><path d=\"M8.5 10.5H15.5\"/>",
 "📽": "<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"12\" rx=\"2\"/><path d=\"M8 20.5H16M12 16.5V20.5\"/>",
 "🖨": "<path d=\"M6.5 8.5V4.5H17.5V8.5\"/><rect x=\"4\" y=\"8.5\" width=\"16\" height=\"8\" rx=\"1.5\"/><rect x=\"7\" y=\"13.5\" width=\"10\" height=\"6\" rx=\"1\"/>",
 "📄": "<path d=\"M6 3.5H14.5L18.5 7.5V19.5C18.5 20.05 18.05 20.5 17.5 20.5H6C5.45 20.5 5 20.05 5 19.5V4.5C5 3.95 5.45 3.5 6 3.5Z\"/><path d=\"M14 3.5V8H18.5M8.5 12H15M8.5 15.5H13\"/>",
 "💡": "<path d=\"M9 18H15M10 20.5H14M12 3.5A5.5 5.5 0 0 0 8.5 13.2C9.2 13.8 9.5 14.5 9.5 15.5H14.5C14.5 14.5 14.8 13.8 15.5 13.2A5.5 5.5 0 0 0 12 3.5Z\"/>",
 "✓": "<path d=\"M5 12.5L9.5 17L19 7.5\"/>",
 "➔": "<path d=\"M5 12H19M13.5 6.5L19 12L13.5 17.5\"/>",
 "🏢": "<rect x=\"4.5\" y=\"3.5\" width=\"15\" height=\"17\" rx=\"1.5\"/><path d=\"M8.5 8H10.5M13.5 8H15.5M8.5 12H10.5M13.5 12H15.5M10.5 20.5V16.5H13.5V20.5\"/>",
 "📤": "<path d=\"M12 14.5V4M8 8L12 4L16 8\"/><path d=\"M4.5 16.5V19.5H19.5V16.5\"/>",
 "📂": "<path d=\"M4 6.5C4 5.4 4.9 4.5 6 4.5H10L12 6.8H18C19.1 6.8 20 7.7 20 8.8V17.5C20 18.6 19.1 19.5 18 19.5H6C4.9 19.5 4 18.6 4 17.5V6.5Z\"/>",
 "📍": "<path d=\"M12 20.5S6 14.5 6 10A6 6 0 1 1 18 10C18 14.5 12 20.5 12 20.5Z\"/><circle cx=\"12\" cy=\"10\" r=\"2\"/>",
 "➕": "<path d=\"M12 5V19M5 12H19\"/>",
 "🤝": "<path d=\"M4.5 6.5C4.5 5.4 5.4 4.5 6.5 4.5H17.5C18.6 4.5 19.5 5.4 19.5 6.5V14.5C19.5 15.6 18.6 16.5 17.5 16.5H9L5 20V6.5Z\"/><path d=\"M8.5 10.5H15.5\"/>",
 "🌐": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M3.5 12H20.5\"/><ellipse cx=\"12\" cy=\"12\" rx=\"4\" ry=\"8.5\"/>",
 "🖥": "<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"12\" rx=\"2\"/><path d=\"M8 20.5H16M12 16.5V20.5\"/>",
 "🕒": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5V12L15 14\"/>",
 "🚨": "<path d=\"M6 17.5V10.5C6 7.2 8.7 4.5 12 4.5C15.3 4.5 18 7.2 18 10.5V17.5\"/><path d=\"M4 17.5H20\"/><path d=\"M10 19.8C10.5 20.6 11.2 21 12 21C12.8 21 13.5 20.6 14 19.8\"/>",
 "🚀": "<path d=\"M12 3.5C15 6 16.5 9.5 16.5 13.5L12 16.5L7.5 13.5C7.5 9.5 9 6 12 3.5Z\"/><path d=\"M9.5 15L7 19.5M14.5 15L17 19.5\"/><circle cx=\"12\" cy=\"10\" r=\"1.4\"/>",
 "✕": "<path d=\"M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5\"/>",
 "✏": "<path d=\"M16.5 4.5L19.5 7.5L8 19H5V16L16.5 4.5Z\"/>",
 "👥": "<circle cx=\"9\" cy=\"8.5\" r=\"3\"/><path d=\"M3.5 18.5C3.5 15.8 6 14 9 14C12 14 14.5 15.8 14.5 18.5\"/><circle cx=\"16.5\" cy=\"9.5\" r=\"2.2\"/><path d=\"M16.5 14C18.7 14 20.5 15.4 20.5 17.8\"/>",
 "🛡": "<path d=\"M12 3.5L19 6.5V12C19 16.5 15.8 19.5 12 20.5C8.2 19.5 5 16.5 5 12V6.5L12 3.5Z\"/>",
 "🔐": "<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"9.5\" rx=\"2\"/><path d=\"M8 10.5V7.5C8 5.3 9.8 3.5 12 3.5C14.2 3.5 16 5.3 16 7.5V10.5\"/>",
 "🔌": "<path d=\"M9 4.5V8M15 4.5V8M7 8H17V12A5 5 0 0 1 7 12V8Z\"/><path d=\"M12 17V20.5\"/>",
 "🗄": "<ellipse cx=\"12\" cy=\"6.2\" rx=\"7.5\" ry=\"2.7\"/><path d=\"M4.5 6.2V12C4.5 13.5 7.8 14.7 12 14.7C16.2 14.7 19.5 13.5 19.5 12V6.2\"/><path d=\"M4.5 12V17.8C4.5 19.3 7.8 20.5 12 20.5C16.2 20.5 19.5 19.3 19.5 17.8V12\"/>",
 "🗑": "<path d=\"M4.5 6.5H19.5\"/><path d=\"M9 6.5V4.5H15V6.5\"/><path d=\"M6.5 6.5L7.5 19.5H16.5L17.5 6.5\"/>",
 "➡": "<path d=\"M5 12H19M13.5 6.5L19 12L13.5 17.5\"/>",
 "⬆": "<path d=\"M12 19V5M6.5 10.5L12 5L17.5 10.5\"/>",
 "⬅": "<path d=\"M19 12H5M10.5 6.5L5 12L10.5 17.5\"/>",
 "🧹": "<path d=\"M14.5 4.5L19.5 9.5L9.5 19.5H4.5V14.5L14.5 4.5Z\"/><path d=\"M12 7L17 12\"/>",
 "🚫": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M6 6L18 18\"/>",
 "⏱": "<circle cx=\"12\" cy=\"13.5\" r=\"7\"/><path d=\"M12 13.5V10M10 3.5H14M18 7L19.5 5.5\"/>",
 "⭐": "<path d=\"M12 3.8L14.5 9L20 9.6L15.9 13.3L17.1 18.8L12 16L6.9 18.8L8.1 13.3L4 9.6L9.5 9Z\"/>",
 "☆": "<path d=\"M12 3.8L14.5 9L20 9.6L15.9 13.3L17.1 18.8L12 16L6.9 18.8L8.1 13.3L4 9.6L9.5 9Z\"/>",
 "★": "<path d=\"M12 3.8L14.5 9L20 9.6L15.9 13.3L17.1 18.8L12 16L6.9 18.8L8.1 13.3L4 9.6L9.5 9Z\" fill=\"currentColor\"/>",
 "❌": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M9 9L15 15M15 9L9 15\"/>",
 "↩": "<path d=\"M9 7L4.5 11.5L9 16\"/><path d=\"M4.5 11.5H14.5C17.3 11.5 19.5 13.7 19.5 16.5V18\"/>",
 "📐": "<path d=\"M4.5 19.5V4.5L19.5 19.5Z\"/><path d=\"M8 16V12.5L11.5 16Z\"/>",
 "👑": "<path d=\"M4 8L8 12L12 5.5L16 12L20 8L18.5 18H5.5Z\"/>",
 "⛔": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M7.5 12H16.5\"/>",
 "⬇": "<path d=\"M12 4.5V19.5M6.5 14L12 19.5L17.5 14\"/>",
 "📏": "<rect x=\"3\" y=\"8\" width=\"18\" height=\"8\" rx=\"1.5\"/><path d=\"M7 8V11M11 8V12M15 8V11M19 8V10\"/>",
 "🏛": "<path d=\"M3.5 9L12 4L20.5 9H3.5Z\"/><path d=\"M6 9V17M10 9V17M14 9V17M18 9V17M3.5 20H20.5\"/>",
 "🔧": "<path d=\"M15 4.5A4.5 4.5 0 0 0 10.2 10.6L4.5 16.3V19.5H7.7L13.4 13.8A4.5 4.5 0 0 0 19.5 9L16.5 12L12 7.5Z\"/>",
 "🚦": "<rect x=\"8\" y=\"3\" width=\"8\" height=\"18\" rx=\"3\"/><circle cx=\"12\" cy=\"7.5\" r=\"1.4\"/><circle cx=\"12\" cy=\"12\" r=\"1.4\"/><circle cx=\"12\" cy=\"16.5\" r=\"1.4\"/>",
 "🔓": "<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"9.5\" rx=\"2\"/><path d=\"M8 10.5V7.5C8 5.3 9.8 3.5 12 3.5C13.6 3.5 15 4.4 15.6 5.8\"/>",
 "👁": "<path d=\"M2.5 12C4.5 7.5 8 5.5 12 5.5C16 5.5 19.5 7.5 21.5 12C19.5 16.5 16 18.5 12 18.5C8 18.5 4.5 16.5 2.5 12Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
 "👷": "<circle cx=\"12\" cy=\"9.5\" r=\"3\"/><path d=\"M7.5 8H16.5M9 8C9 5.8 10.3 4.5 12 4.5C13.7 4.5 15 5.8 15 8\"/><path d=\"M5.5 19.5C5.5 16.5 8.3 14.5 12 14.5C15.7 14.5 18.5 16.5 18.5 19.5\"/>",
 "👔": "<circle cx=\"12\" cy=\"7.5\" r=\"3.5\"/><path d=\"M5 20C5 16.5 8 14 12 14C16 14 19 16.5 19 20\"/><path d=\"M12 14L10.8 16.5L12 19L13.2 16.5Z\"/>",
 "🙋": "<circle cx=\"9\" cy=\"8\" r=\"3.2\"/><path d=\"M3.5 19.5C3.5 16.5 6 14.5 9 14.5C10.2 14.5 11.3 14.8 12.2 15.3\"/><path d=\"M14 15L16 17L20.5 12.5\"/>",
 "🔢": "<path d=\"M4.5 9.5L6.5 8V16\"/><path d=\"M10 10C10 8.9 10.9 8 12 8C13.1 8 14 8.9 14 10C14 11.5 10 13 10 16H14\"/><path d=\"M16.5 8H20L18 11C19.4 11 20 12 20 13.5C20 15 19 16 17.8 16C17 16 16.5 15.6 16.2 15\"/>",
 "🏁": "<path d=\"M5.5 20.5V4\"/><path d=\"M5.5 4.5H18L15.5 8.5L18 12.5H5.5\"/>",
 "🏷": "<path d=\"M3.5 12V4.5H11L20 13.5L13.5 20L3.5 12Z\"/><circle cx=\"8\" cy=\"8.5\" r=\"1.2\"/>",
 "🔹": "<path d=\"M12 6L17 12L12 18L7 12Z\" fill=\"currentColor\"/>",
 "🧰": "<rect x=\"3.5\" y=\"8.5\" width=\"17\" height=\"11\" rx=\"1.5\"/><path d=\"M9 8.5V6C9 5.2 9.7 4.5 10.5 4.5H13.5C14.3 4.5 15 5.2 15 6V8.5M3.5 13H20.5M10.5 13V15H13.5V13\"/>",
 "⏪": "<path d=\"M11.5 6.5L5.5 12L11.5 17.5Z\"/><path d=\"M19 6.5L13 12L19 17.5Z\"/>",
 "⏰": "<circle cx=\"12\" cy=\"13\" r=\"7\"/><path d=\"M12 9.5V13L14.5 14.5M5 5.5L7.5 3.5M19 5.5L16.5 3.5\"/>",
 "📶": "<path d=\"M5 19.5V15M9.5 19.5V11.5M14 19.5V8M18.5 19.5V4.5\"/>",
 "🚪": "<path d=\"M6 20.5V4.5C6 3.95 6.45 3.5 7 3.5H17C17.55 3.5 18 3.95 18 4.5V20.5M4 20.5H20\"/><circle cx=\"14.5\" cy=\"12.5\" r=\"0.9\" fill=\"currentColor\" stroke=\"none\"/>",
 "⏸": "<path d=\"M9 6V18M15 6V18\"/>",
 "❔": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M9.8 9.5C9.8 8.2 10.8 7.3 12 7.3C13.3 7.3 14.2 8.2 14.2 9.4C14.2 11.2 12 11.4 12 13.3\"/><circle cx=\"12\" cy=\"16.3\" r=\"0.7\" fill=\"currentColor\" stroke=\"none\"/>",
 "🏭": "<path d=\"M3.5 20.5V11L8.5 14V11L13.5 14V6.5H16.5V4H19V20.5Z\"/><path d=\"M7 17.5H9M12 17.5H14M17 17.5H17.5\"/>",
 "📎": "<path d=\"M19 11.5L12 18.5C10 20.5 7 20.5 5 18.5C3 16.5 3 13.5 5 11.5L12.5 4C13.9 2.6 16.1 2.6 17.5 4C18.9 5.4 18.9 7.6 17.5 9L10.5 16C9.7 16.8 8.3 16.8 7.5 16C6.7 15.2 6.7 13.8 7.5 13L14 6.5\"/>",
 "🎉": "<path d=\"M4 20L8.5 8.5L15.5 15.5Z\"/><path d=\"M13 4.5L13.5 6.5M18 6L16.5 7.5M19.5 11L17.5 11.5M10.5 3.5C11.5 5 11 6.5 10 7.5M20.5 13.5C19 12.5 17.5 13 16.5 14\"/>",
 "🧪": "<path d=\"M9.5 3.5H14.5M10.5 3.5V9L5 18.5C4.5 19.4 5.1 20.5 6.2 20.5H17.8C18.9 20.5 19.5 19.4 19 18.5L13.5 9V3.5\"/><path d=\"M7.5 14.5H16.5\"/>",
 "🎛": "<path d=\"M5 4.5V19.5M12 4.5V19.5M19 4.5V19.5\"/><path d=\"M3 9H7M10 15H14M17 8H21\"/>",
 "🔤": "<path d=\"M4.5 18.5L8.5 6.5L12.5 18.5M6 14.5H11\"/><path d=\"M15 10.5H19.5M17.2 8V17C17.2 18 17.8 18.5 18.8 18.5\"/>",
 "💽": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><circle cx=\"12\" cy=\"12\" r=\"2.5\"/>",
 "🔗": "<path d=\"M10 14L14 10\"/><path d=\"M8.5 11.5L6.5 13.5C5 15 5 17.5 6.5 19C8 20.5 10.5 20.5 12 19L14 17\"/><path d=\"M15.5 12.5L17.5 10.5C19 9 19 6.5 17.5 5C16 3.5 13.5 3.5 12 5L10 7\"/>",
 "➖": "<path d=\"M5.5 12H18.5\"/>",
 "📘": "<path d=\"M5 4.5H17.5C18.05 4.5 18.5 4.95 18.5 5.5V19.5H6.5C5.67 19.5 5 18.83 5 18V4.5Z\"/><path d=\"M5 16.5H18.5M9 8.5H15\"/>",
 "🖐": "<path d=\"M8 12V6.5C8 5.7 8.7 5 9.5 5C10.3 5 11 5.7 11 6.5V11M11 10V4.5C11 3.7 11.7 3 12.5 3C13.3 3 14 3.7 14 4.5V11M14 10V5.5C14 4.7 14.7 4 15.5 4C16.3 4 17 4.7 17 5.5V14C17 17.6 14.8 20.5 11.5 20.5C9 20.5 7.6 19.3 6.2 17L4.4 13.8C4 13 4.3 12.1 5 11.7C5.7 11.3 6.6 11.6 7 12.3L8 14\"/>",
 "🧾": "<path d=\"M6 3.5H18V20.5L15.5 19L13 20.5L10.5 19L8 20.5L6 19.3Z\"/><path d=\"M9 8H15M9 11.5H15M9 15H13\"/>",
 "🪶": "<path d=\"M19.5 4.5C13 5 7.5 9.5 6.5 17.5L5 20M6.5 17.5H12C16 17.5 18.5 13 19.5 4.5Z\"/><path d=\"M9.5 13.5H15\"/>",
 "📡": "<path d=\"M12 12V20.5M8.5 20.5H15.5\"/><circle cx=\"12\" cy=\"10\" r=\"1.6\"/><path d=\"M8.5 6.5C6.5 8.5 6.5 11.5 8.5 13.5M15.5 6.5C17.5 8.5 17.5 11.5 15.5 13.5\"/>",
 "🧭": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><polygon points=\"15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5 15.5 8.5\"/>",
 "💻": "<rect x=\"5\" y=\"5\" width=\"14\" height=\"10\" rx=\"1.5\"/><path d=\"M3 19H21L19.5 15H4.5Z\"/>",
 "🟢": "<circle cx=\"12\" cy=\"12\" r=\"6\" fill=\"currentColor\" stroke=\"none\"/>",
 "🟡": "<circle cx=\"12\" cy=\"12\" r=\"6\" fill=\"currentColor\" stroke=\"none\"/>",
 "🔴": "<circle cx=\"12\" cy=\"12\" r=\"6\" fill=\"currentColor\" stroke=\"none\"/>",
 "⚪": "<circle cx=\"12\" cy=\"12\" r=\"6\" fill=\"currentColor\" stroke=\"none\"/>",
 "🔵": "<circle cx=\"12\" cy=\"12\" r=\"6\" fill=\"currentColor\" stroke=\"none\"/>",
 "♻": "<path d=\"M20 11A8 8 0 0 0 6.3 5.3L4 7.5\"/><path d=\"M4 4V7.5H7.5\"/><path d=\"M4 13A8 8 0 0 0 17.7 18.7L20 16.5\"/><path d=\"M20 20V16.5H16.5\"/>",
 "📁": "<path d=\"M4 6.5C4 5.4 4.9 4.5 6 4.5H10L12 6.8H18C19.1 6.8 20 7.7 20 8.8V17.5C20 18.6 19.1 19.5 18 19.5H6C4.9 19.5 4 18.6 4 17.5V6.5Z\"/>",
 "📜": "<path d=\"M6 3.5H14.5L18.5 7.5V19.5C18.5 20.05 18.05 20.5 17.5 20.5H6C5.45 20.5 5 20.05 5 19.5V4.5C5 3.95 5.45 3.5 6 3.5Z\"/><path d=\"M14 3.5V8H18.5M8.5 12H15M8.5 15.5H13\"/>",
 "📆": "<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"16\" rx=\"2\"/><path d=\"M8 2.8V6M16 2.8V6M3.5 9.5H20.5\"/>",
 "🛠": "<path d=\"M15 4.5A4.5 4.5 0 0 0 10.2 10.6L4.5 16.3V19.5H7.7L13.4 13.8A4.5 4.5 0 0 0 19.5 9L16.5 12L12 7.5Z\"/>"
},
  TONE: {"✅": "ok", "⚠": "warn", "✓": "ok", "🚨": "danger", "🟢": "ok", "🟡": "warn", "🔴": "danger", "⚪": "muted", "🔵": "info", "❌": "danger", "⛔": "danger", "🚫": "danger", "⭐": "star", "★": "star", "🔹": "info"},
  DOTS: ["🟢", "🟡", "🔴", "⚪", "🔵"],
  _re: null,
  svg(emoji) {
    const inner = this.MAP[emoji];
    if (!inner) return "";
    const dot = this.DOTS.indexOf(emoji) !== -1;
    const tone = this.TONE[emoji] ? " ico-" + this.TONE[emoji] : "";
    return `<svg class="${dot ? "iostar-dot" : "iostar-ico"}${tone}" data-ico="${emoji}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  },
  regex() {
    if (this._re) return this._re;
    const keys = Object.keys(this.MAP).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    this._re = new RegExp("(" + keys.join("|") + ")\\uFE0F?", "g");
    return this._re;
  },
  SKIP: "input, textarea, select, option, script, style, svg, [contenteditable], [data-icons-skip], .ProseMirror",
  _make(emoji, solo) {
    const tpl = document.createElement("template");
    tpl.innerHTML = this.svg(emoji);
    const el = tpl.content.firstChild;
    if (solo) el.classList.add("ico-solo");
    return el;
  },
  // 텍스트 하나: 들어 있는 이모지를 모두 같은 선 아이콘으로 (뒤 공백 하나는 아이콘 간격으로 대신)
  _text(node) {
    const t = node.nodeValue;
    if (!t || t.length > 600) return;
    const re = this.regex();
    re.lastIndex = 0;
    if (!re.test(t)) return;
    const parent = node.parentNode;
    if (!parent || parent.nodeType !== 1 || parent.closest(this.SKIP)) return;
    re.lastIndex = 0;
    const parts = [];
    let last = 0, m;
    while ((m = re.exec(t))) {
      parts.push(t.slice(last, m.index));
      parts.push({ e: m[1] });
      last = m.index + m[0].length;
      if (t[last] === " ") last++;
    }
    parts.push(t.slice(last));
    const onlyIcons = parts.every(x => typeof x !== "string" || !x.trim());
    // 이미 바꾼 자리(바로 앞 아이콘이 같은 것)는 글자만 정리
    const first = parts[1] && parts[1].e;
    const prev = node.previousSibling;
    const already = parts.length === 3 && !parts[0].trim() && prev && prev.nodeType === 1 && prev.getAttribute && prev.getAttribute("data-ico") === first;
    if (already) { node.nodeValue = parts[0] + parts[2]; return; }
    const frag = document.createDocumentFragment();
    parts.forEach((x, i) => {
      if (typeof x === "string") { if (x && i < parts.length - 1) frag.appendChild(document.createTextNode(x)); }
      else frag.appendChild(this._make(x.e, onlyIcons));
    });
    node.nodeValue = parts[parts.length - 1];
    parent.insertBefore(frag, node);
  },
  apply(root) {
    if (!root) return;
    if (root.nodeType === 3) return this._text(root);
    if (root.nodeType !== 1 || root.closest && root.closest(this.SKIP)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const list = [];
    let n;
    while ((n = w.nextNode())) list.push(n);
    list.forEach(x => this._text(x));
  },
  init() {
    if (this._obs) return;
    this.apply(document.body);
    let queue = new Set(), timer = null;
    const flush = () => { timer = null; const q = queue; queue = new Set(); q.forEach(x => { if (x.isConnected) this.apply(x); }); };
    this._obs = new MutationObserver(muts => {
      muts.forEach(m => {
        if (m.type === "characterData") queue.add(m.target);
        else m.addedNodes.forEach(x => queue.add(x));
      });
      if (!timer) timer = setTimeout(flush, 0);
    });
    this._obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
};
window.Icons = Icons;
document.addEventListener("DOMContentLoaded", () => Icons.init());

// 테마에 맞춘 탭 아이콘(favicon): 밝은 머리말 테마(Urban Slate · Nordic Sage)는 무채색 아이콘
var ThemeLogo = {
  MONO: ["urban-slate", "nordic-sage"],
  sync() {
    const link = document.querySelector('link[rel="icon"]');
    if (!link) return;
    if (!this._orig) this._orig = link.getAttribute("href");
    const mono = this.MONO.indexOf(document.body.getAttribute("data-theme")) !== -1;
    const want = mono ? "static/img/iostar_mono_32.png" : this._orig;
    if (link.getAttribute("href") !== want) link.setAttribute("href", want);
  },
  init() {
    this.sync();
    new MutationObserver(() => this.sync()).observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
  }
};
window.ThemeLogo = ThemeLogo;
document.addEventListener("DOMContentLoaded", () => ThemeLogo.init());
