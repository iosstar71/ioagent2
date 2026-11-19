// =============================================================================
// 공용 자료형 (JSDoc @typedef 만 — 실행되는 코드 없음, 배포본에 넣지 않음)
//  편집기(VS Code 등)와 `npx -p typescript tsc -p jsconfig.json` 이 계산 엔진을 검사할 때 씀. 필드 정의는 docs/DATA_MODEL.md
// =============================================================================

/**
 * @typedef {Object} WbsTask
 * @property {string} [id]             WBS ID (예: "1.1.2")
 * @property {number} [level]          계층 레벨 (1~4)
 * @property {string} [system]         서브시스템명
 * @property {string} [name]           과업(Task)명
 * @property {number|string} [weight]  가중치 (소수점 1자리)
 * @property {string} [reqId]          연계 요구사항 ID
 * @property {string} [pStart]         계획 시작일 (YYYY-MM-DD)
 * @property {string} [pEnd]           계획 종료일 (YYYY-MM-DD)
 * @property {string} [aStart]         실적 시작일 (YYYY-MM-DD)
 * @property {string} [aEnd]           실적 종료일 (YYYY-MM-DD)
 * @property {number|string} [pProg]   계획 진척률 (0~100)
 * @property {number|string} [aProg]   실적 진척률 (0~100)
 * @property {string} [owner]          담당자명
 * @property {string} [note]           비고 / 산출물 메모
 * @property {boolean} [isLeaf]        최하위(Leaf) 노드 여부
 * @property {string} [status]         계산된 상태 ("완료" | "진행중" | "지연" | "대기" 등)
 */

/**
 * @typedef {Object} ReqItem
 * @property {string} [id]
 * @property {string} [system]
 * @property {string} [name]
 * @property {string} [type]
 * @property {string} [priority]
 * @property {string} [acceptYn]
 * @property {string} [status]         "대기" | "진행" | "완료" | "보류" | "삭제"
 */

/**
 * @typedef {Object} VocItem
 * @property {string} [id]
 * @property {string} [system]
 * @property {string} [category]       "VOC" | "버그" | "이슈"
 * @property {string} [priority]
 * @property {string} [title]
 * @property {string} [requester]
 * @property {string} [reqDate]
 * @property {string} [targetDate]
 * @property {string} [status]         "대기" | "진행" | "완료" | "제외" | "보류" | "삭제"
 * @property {string} [actionNote]
 */

/**
 * @typedef {Object} DeliverableItem
 * @property {number|string} [id]
 * @property {string} [round]          제출 차수
 * @property {string} [system]
 * @property {string} [phase]
 * @property {string} [name]
 * @property {string} [planDate]
 * @property {string} [actDate]
 * @property {string} [status]         "미작성" | "작성중" | "검토요청" | "보완완료"
 * @property {string} [manager]
 */

/**
 * @typedef {Object} SubsystemItem
 * @property {string} [code]
 * @property {string} name
 * @property {string} [domain]
 * @property {string} [projType]
 * @property {string} [sdlcCode]
 * @property {number|string} [weight]
 * @property {string} [pmName]
 */

/**
 * @typedef {Object} SdlcPhase
 * @property {string} name
 * @property {string[]} [keywords]
 * @property {number} [weight]
 */

/**
 * @typedef {Object} SdlcSpec
 * @property {string} code
 * @property {string} name
 * @property {SdlcPhase[]} phases
 */

/**
 * @typedef {Object} ProjectConfig
 * @property {string} [projectName]
 * @property {string} [startDate]
 * @property {string} [endDate]
 * @property {string} [reportDate]
 * @property {number} [weekStartDay]
 * @property {number|string} [delayGap]
 * @property {number|string} [dueDays]
 * @property {string[]} [holidays]
 * @property {string} [theme]
 */

/**
 * @typedef {Object} ProjectRole
 * @property {"SYS_ADMIN"|"PM"|"LEAD"|"MEMBER"} role
 * @property {string} subsystem
 * @property {string} [dept]
 */

/**
 * @typedef {Object} UserRow
 * @property {string} empNo
 * @property {string} name
 * @property {"SYS_ADMIN"|"PM"|"LEAD"|"MEMBER"} role
 * @property {string} [subsystem]
 * @property {string} [dept]
 * @property {string} [lang]
 * @property {Object.<string, ProjectRole>} [projectRoles]
 */

/**
 * @typedef {Object} ReqStats
 * @property {ReqItem[]} list
 * @property {number} total
 * @property {number} done
 * @property {number} prog
 * @property {number} rate
 */

/**
 * @typedef {Object} VocStats
 * @property {VocItem[]} list
 * @property {number} total
 * @property {number} done
 * @property {number} prog
 * @property {number} wait
 * @property {number} rate
 */

/**
 * @typedef {Object} DelivStats
 * @property {DeliverableItem[]} list
 * @property {number} total
 * @property {number} done
 * @property {number} ing
 * @property {number} rate
 */

/**
 * @typedef {Object} WeightGroup
 * @property {string} sys
 * @property {number} parent           L1 묶음이면 -1
 * @property {number[]} kids
 * @property {number} target
 * @property {number} [sum]
 */

/**
 * @typedef {Object} WeightCheckResult
 * @property {WeightGroup[]} groups
 * @property {Set<number>} badRows
 */

/**
 * @typedef {Object} WeekRange
 * @property {string} start            YYYY-MM-DD
 * @property {string} end              YYYY-MM-DD
 * @property {number} [weekNum]
 * @property {number} [year]
 * @property {string} [label]
 */

/**
 * @typedef {Object} WeightedProgressResult
 * @property {number} plan
 * @property {number} actual
 */
