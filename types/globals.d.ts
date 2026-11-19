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
