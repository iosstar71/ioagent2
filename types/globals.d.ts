// 전역 이름 선언 (검사용 — 실행되는 코드 없음). 화면 코드가 모듈 없이 전역으로 연결되어 있어 검사기에 알려 줌
declare var wbsData: WbsTask[];
declare var projectConfig: any;
declare var subsystemsMeta: any[];
declare var reqMasterData: any[];
declare var vocData: any[];
declare var deliverablesData: any[];
declare var SdlcBoard: any;
declare var WeekFmt: any;
declare var AuthManager: any;
declare var Permission: any;
declare var SyncManager: any;
declare function rebuildAll(forceImmediateSave?: boolean): void;
declare function showToast(msg: string, type?: string): void;
// 화면 공통 (WBS 표 · 상세 패널 · 날짜 도움 함수 검사용)
declare var UiEvents: any;
declare var UiH: any;
declare var I18N: any;
declare var AppStore: any;
declare var ProjectContext: any;
declare var ButtonStandard: any;
declare var WbsStatusChips: any;
declare var BaselineUI: any;
declare var projectUsers: any[];
declare var communicationsData: any[];
declare function escapeHtml(v: any): string;
declare function escapeAttr(v: any): string;
declare function persistChanges(force?: boolean): void;
declare function getSubsystemOptionsHtml(selected?: string): string;
declare function isDateReversed(a?: string, b?: string): boolean;
declare function getSubtreeEndIndex(idx: number): number;
declare function openConfirmDialog(msg: string, onOk: Function, opts?: any): void;

