import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import axios from 'axios'
import './App.css'

const API_BASE = 'http://127.0.0.1:8000/api'
const WORKSPACE_RESTORE_TIMEOUT_MS = 8000
const ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000
const ROLE_LOGIN_ENABLED = false
const SMART_SETTINGS_KEY = 'attendance-smart-settings'
// v8 invalidates the short-lived v7 workspace cache that could persist the raw
// pre-benefit result while automatic newcomer overrides were already saved.
const ATTENDANCE_CALCULATION_VERSION = 8

type Summary = {
  blocks: number
  source_employee_count?: number
  empty_employee_count?: number
  result_cells: number
  missing_cells: number
  late_cells: number
  manual_check_count: number
}

type DayResult = {
  day: number
  column: string
  punches: string[]
  work_value: number | string | null
  missing_count: number | string | null
  late_minutes: number | null
  newcomer_benefit?: string
}

type EmployeeBlock = {
  employee_code: string
  header_row: number
  punch_row: number
  missing_row: number
  late_row: number
  result_row: number
  results: DayResult[]
}

type ManualCheck = {
  employee_code: string
  day: number
  cell: string
  punches: string[]
  messages: string[]
}

type ReviewMemoryRecord = {
  employee_code: string
  day: number
  punches: string[]
  work_value: number | string | null
  missing_count: number | string | null
  late_minutes: number | null
  manual_checks: string[]
  review_notes: string[]
}

type ReviewMemory = {
  period: HistoryPeriod | null
  records: ReviewMemoryRecord[]
}

type AnalyzeResponse = {
  session_id: string
  filename: string
  factory?: FactoryMode
  sheet_name: string
  period: PeriodInfo
  summary: Summary
  blocks: EmployeeBlock[]
  manual_checks: ManualCheck[]
  normalized_raw?: boolean
  missing_output1_summary?: boolean
  normalization_summary?: NormalizationSummary
}

type NormalizationRequiredResponse = {
  requires_normalization: true
  resume_token: string
  message: string
  sheet_name: string
  raw_employee_count: number
  retained_employee_count?: number
  discarded_empty_employee_count?: number
  detected_block_count: number
  missing_output1_summary?: boolean
}

type NormalizationSummary = {
  raw_employee_count: number
  retained_employee_count: number
  discarded_empty_employee_count: number
}

type AnalysisRequestConfig = {
  signal?: AbortSignal
  timeout?: number
  requestId?: string
}

type FactoryMode = 'factory1' | 'factory2'

type PeriodInfo = {
  month: number | null
  year: number | null
  label: string
}

type PayrollEmployee = {
  employee_code: string
  name: string
  bank_account?: string
  start_work_note: string
  note: string
  total_hours: number
  monthly_salary: number | null
  daily_salary_input: number | null
  daily_salary: number
  hourly_salary: number
  standard_work_days: number
  work_days: number
  overtime_hours?: number
  bonus: number
  nq_penalty?: number
  advance_or_penalty: number
  final_salary: number
}

type EmployeeCardSource = 'current' | 'history' | 'final_copy'

type EmployeeCardSourceSelection = {
  source: EmployeeCardSource
  id?: string
  label: string
}

type ConfirmationOptions = {
  kicker?: string
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
}

type ConfirmationRequest = ConfirmationOptions & {
  resolve: (confirmed: boolean) => void
}

type PayrollForm = {
  employee_code: string
  name: string
  start_work_note: string
  monthly_salary: string
  daily_salary: string
  hourly_salary: string
  standard_work_days: string
  bonus: string
  advance_or_penalty: string
  note: string
}

type BulkPayrollField = 'bonus' | 'advance_or_penalty' | 'note'

type PayrollPatchUpdate = {
  employeeCode: string
  patch: Partial<PayrollForm>
}

type ActiveView = 'attendance' | 'payroll' | 'employees' | 'history' | 'attendanceOverview' | 'cloud' | 'inbox' | 'bank'

type HistoryPeriod = {
  id: string
  factory?: FactoryMode
  month: number
  year: number
  label: string
  source_filename: string
  sheet_name: string
  block_count: number
  result_cells: number
  missing_cells: number
  late_cells: number
  manual_check_count: number
  created_at: string
}

type HistoryFinalCopy = {
  id: string
  factory?: FactoryMode
  month: number
  year: number
  label: string
  filename: string
  path: string
  folder: string
  size_bytes: number
  modified_at: string
}

type HistoryEmployee = {
  employee_code: string
  employee_name: string
  total_hours: number
  work_days: number
  monthly_salary: number | null
  daily_salary: number
  hourly_salary: number
  standard_work_days: number
  bonus: number
  advance_or_penalty: number
  final_salary: number
  note: string
  daily_records: HistoryDailyRecord[]
}

type HistoryDailyRecord = {
  day: number
  punches: string[]
  work_value: number | string | null
  missing_count: number | string | null
  late_minutes: number | null
  manual_checks: string[]
  review_notes?: string[]
}

type HistoryDetail = {
  period: HistoryPeriod
  employees: HistoryEmployee[]
}

type HistorySearchResult = {
  period_id: string
  factory?: FactoryMode
  month: number
  year: number
  label: string
  employee_code: string
  employee_name: string
  total_hours: number
  work_days: number
  final_salary: number
  note: string
}

type HistoryEditableField =
  | 'employee_name'
  | 'hourly_salary'
  | 'bonus'
  | 'advance_or_penalty'
  | 'note'

type HistoryDailyDraft = {
  day: number
  punches: string[]
  work_value: string
  missing_count: string
  late_minutes: string
  note: string
}

type HistoryEmployeeDraft = Record<HistoryEditableField, string> & {
  daily_records: HistoryDailyDraft[]
}

type LatestHistoryInfo = {
  period: HistoryPeriod | null
  employee_codes: string[]
}

type EmployeeNovelty = 'first-time' | 'returning'

type NewEmployeeItem = PayrollEmployee & {
  novelty: EmployeeNovelty
}

type AttendanceOverviewMonth = {
  month: number
  total_hours: number
  work_days: number
  late_count: number
  issue_count: number
}

type AttendanceOverviewEmployee = {
  employee_code: string
  employee_name: string
  months: AttendanceOverviewMonth[]
  total_hours: number
  total_work_days: number
  average_work_days: number
  total_late_count: number
  total_issue_count: number
  active: boolean
}

type AttendanceOverview = {
  factory?: FactoryMode
  years: number[]
  year: number | null
  latest_month: number | null
  employees: AttendanceOverviewEmployee[]
  summary: {
    active_count: number
    inactive_count: number
    employee_count: number
    total_work_days: number
    total_hours: number
  }
  source?: {
    mode: string
    final_copy_months: number[]
    machine_months: number[]
    fallback_final_copy_months?: number[]
  }
}

type CloudConfig = {
  enabled: boolean
  configured: boolean
  supabase_url: string
  sync_on_save: boolean
  last_test_at?: string | null
  last_sync_at?: string | null
  last_error?: string | null
  key_hint: string
  drive_backup_enabled: boolean
  drive_backup_dir: string
  local_export_dir: string
  drive_root_path?: string
  drive_excel_path?: string
  drive_zip_path?: string
  backup_on_history_change: boolean
  last_backup_at?: string | null
  last_backup_path?: string | null
  last_backup_error?: string | null
}

type CloudConfigForm = {
  enabled: boolean
  supabase_url: string
  service_role_key: string
  sync_on_save: boolean
  drive_backup_enabled: boolean
  drive_backup_dir: string
  local_export_dir: string
  backup_on_history_change: boolean
}

type CloudSubmission = {
  id: string
  month: number
  year: number
  label: string
  source_filename: string
  source_path: string
  sheet_name: string
  block_count: number
  manual_check_count: number
  created_at: string
  updated_at: string
}

type WorkbookRole =
  | 'analysis'
  | 'mapping_current'
  | 'mapping_previous'
  | 'final_copy'
  | 'recalculate_output1'
  | 'recalculate_output2'

type FileInspection = {
  accepted: boolean
  detected_kind: string
  period_label: string
  employee_count: number
  ignored_trailing_style_rows?: number
}

type ProfileSyncSummary = {
  profile_count?: number
  updated_count?: number
  conflict_count?: number
  bank_account_sync?: {
    conflict_count?: number
    conflict_codes?: string[]
    duplicate_accounts?: Array<{ account_number?: string; employee_codes?: string[] }>
  }
}

type AppRole = 'owner' | 'staff'

type AuthUser = {
  id: string
  email: string
  role: AppRole
  display_name: string
  allowed_factories: FactoryMode[]
}

type AuthSession = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  user: AuthUser
}

type LoginForm = {
  email: string
  password: string
}

const AUTH_STORAGE_KEY = 'attendance_auth_session'

type MappingSummary = {
  matched_count: number
  new_count: number
  inactive_count: number
  deduction_review_count?: number
  bank_missing_count?: number
  bank_changed_count?: number
  bank_accounts_saved?: number
  bank_backup_status?: string
  matched_codes?: string[]
  new_codes?: string[]
  inactive_codes?: string[]
  deduction_review_codes?: string[]
}

type MappingBankAccount = {
  employee_code: string
  name: string
  saved_account: string
  candidate_account: string
}

type MappingBankInspection = {
  current_count: number
  missing_count: number
  changed_count: number
  missing_bank_accounts: MappingBankAccount[]
  changed_bank_accounts: MappingBankAccount[]
}

type MappingBankDecision = {
  mode: 'keep' | 'candidate' | 'custom'
  account: string
}

type WorkDayRow = {
  day: number
  punches: string[]
  work_value: number | string | null
  missing_count: number | string | null
  late_minutes: number | null
  manual_checks: string[]
}

type PayrollReviewType = 'missing' | 'late' | 'rule_change' | 'newcomer_benefit'
type PayrollReviewStatus = 'pending' | 'ok' | 'edited'
type PayrollReviewOrigin = 'new' | 'history-applied' | 'rule-changed'

type PayrollReviewItem = {
  id: string
  type: PayrollReviewType
  employee_code: string
  novelty?: EmployeeNovelty
  day: number
  punches: string[]
  original_value: number | string
  value: string
  original_work_value: number | string | null
  work_value: string
  status: PayrollReviewStatus
  messages: string[]
  origin?: PayrollReviewOrigin
  history_value?: number | string | null
  history_work_value?: number | string | null
  history_review_notes?: string[]
  history_period_label?: string
  pair_selected?: boolean
}

type TemporaryWorkspace = {
  version: 1
  calculation_version?: number
  newcomer_benefit_enabled?: boolean
  show_newcomer_benefit_review?: boolean
  saved_at: string
  factory: FactoryMode
  data: AnalyzeResponse
  payroll_employees?: PayrollEmployee[]
  review_items: PayrollReviewItem[]
  review_memory: ReviewMemory | null
  latest_history_info: LatestHistoryInfo
  known_history_codes: string[]
  selected_code: string
  active_view: ActiveView
  period_month: string
  period_year: string
  employee_list_month: string
  employee_list_year: string
}

const TEMPORARY_WORKSPACE_CACHE_PREFIX = 'attendance-temporary-workspace-v2-'

function temporaryWorkspaceCacheKey(factory: FactoryMode) {
  return `${TEMPORARY_WORKSPACE_CACHE_PREFIX}${factory}`
}

function readCachedTemporaryWorkspace(factory: FactoryMode): TemporaryWorkspace | null {
  try {
    const raw = localStorage.getItem(temporaryWorkspaceCacheKey(factory))
    if (!raw) return null
    const workspace = JSON.parse(raw) as TemporaryWorkspace
    if (workspace.version !== 1 || workspace.factory !== factory || !workspace.data?.session_id) return null
    return workspace
  } catch {
    return null
  }
}

function readStoredFactoryMode(): FactoryMode {
  try {
    return localStorage.getItem('attendance-current-factory') === 'factory2' ? 'factory2' : 'factory1'
  } catch {
    return 'factory1'
  }
}

function App() {
  const [auth, setAuth] = useState<AuthSession | null>(null)
  const [authLoading, setAuthLoading] = useState(ROLE_LOGIN_ENABLED)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginForm, setLoginForm] = useState<LoginForm>({ email: '', password: '' })
  const [file, setFile] = useState<File | null>(null)
  const [factoryMode, setFactoryMode] = useState<FactoryMode>(() => readStoredFactoryMode())
  const factoryModeRef = useRef<FactoryMode>(factoryMode)
  const [workspaceCalculationVersion, setWorkspaceCalculationVersion] = useState(ATTENDANCE_CALCULATION_VERSION)
  const [recalculateFile, setRecalculateFile] = useState<File | null>(null)
  const [mappingCurrentFile, setMappingCurrentFile] = useState<File | null>(null)
  const [mappingPreviousFile, setMappingPreviousFile] = useState<File | null>(null)
  const [finalCopyFile, setFinalCopyFile] = useState<File | null>(null)
  const [finalCopyMonth, setFinalCopyMonth] = useState('')
  const [finalCopyYear, setFinalCopyYear] = useState('')
  const [finalCopyInspecting, setFinalCopyInspecting] = useState(false)
  const [finalCopyConflictChecking, setFinalCopyConflictChecking] = useState(false)
  const [fileInspectingRole, setFileInspectingRole] = useState<WorkbookRole | null>(null)
  const [data, setData] = useState<AnalyzeResponse | null>(null)
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false)
  const [reviewSourceSessionId, setReviewSourceSessionId] = useState('')
  const [restoredAnalysisFilename, setRestoredAnalysisFilename] = useState('')
  const [reviewMemory, setReviewMemory] = useState<ReviewMemory | null>(null)
  const [payrollEmployees, setPayrollEmployees] = useState<PayrollEmployee[]>([])
  const [employeeRegistry, setEmployeeRegistry] = useState<PayrollEmployee[]>([])
  const [payrollReviewItems, setPayrollReviewItems] = useState<PayrollReviewItem[]>([])
  const [latestHistoryInfo, setLatestHistoryInfo] = useState<LatestHistoryInfo>({ period: null, employee_codes: [] })
  const [knownHistoryCodes, setKnownHistoryCodes] = useState<string[]>([])
  const [selectedCode, setSelectedCode] = useState<string>('')
  const [form, setForm] = useState<PayrollForm>(emptyPayrollForm())
  const [activeView, setActiveView] = useState<ActiveView>('employees')
  const [periodMonth, setPeriodMonth] = useState('')
  const [periodYear, setPeriodYear] = useState('')
  const [historyPeriods, setHistoryPeriods] = useState<HistoryPeriod[]>([])
  const [historyFinalCopies, setHistoryFinalCopies] = useState<HistoryFinalCopy[]>([])
  const [attendanceOverview, setAttendanceOverview] = useState<AttendanceOverview | null>(null)
  const [attendanceOverviewYear, setAttendanceOverviewYear] = useState('')
  const [attendanceOverviewSearch, setAttendanceOverviewSearch] = useState('')
  const [attendanceOverviewStatus, setAttendanceOverviewStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [attendanceOverviewCode, setAttendanceOverviewCode] = useState('')
  const [employeeListYear, setEmployeeListYear] = useState('')
  const [employeeListMonth, setEmployeeListMonth] = useState('')
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [selectedFinalCopyId, setSelectedFinalCopyId] = useState('')
  const [historySelectedCode, setHistorySelectedCode] = useState('')
  const [historyDetail, setHistoryDetail] = useState<HistoryDetail | null>(null)
  const [historySearchResults, setHistorySearchResults] = useState<HistorySearchResult[]>([])
  const [historyFilters, setHistoryFilters] = useState({ employee_code: '', month: '', year: '' })
  const [loading, setLoading] = useState(false)
  const analysisAbortControllerRef = useRef<AbortController | null>(null)
  const analysisRequestIdRef = useRef<string | null>(null)
  const analysisCommittedRef = useRef(false)
  const [recalculateLoading, setRecalculateLoading] = useState(false)
  const [mappingLoading, setMappingLoading] = useState(false)
  const [recalculateOutputKind, setRecalculateOutputKind] = useState<'output1' | 'output2'>('output1')
  const [output1Loading, setOutput1Loading] = useState(false)
  const [payrollLoading, setPayrollLoading] = useState(false)
  const [output2ChoiceOpen, setOutput2ChoiceOpen] = useState(false)
  const [employeeCardChoiceOpen, setEmployeeCardChoiceOpen] = useState(false)
  const [employeeCardKindChoiceOpen, setEmployeeCardKindChoiceOpen] = useState(false)
  const [employeeCardSource, setEmployeeCardSource] = useState<EmployeeCardSourceSelection | null>(null)
  const [employeeCardArchiveChoiceOpen, setEmployeeCardArchiveChoiceOpen] = useState(false)
  const [employeeCardArchiveKind, setEmployeeCardArchiveKind] = useState<'history' | 'final_copy'>('history')
  const [employeeCardArchiveItems, setEmployeeCardArchiveItems] = useState<Array<HistoryPeriod | HistoryFinalCopy>>([])
  const [employeeCardArchiveSelectedId, setEmployeeCardArchiveSelectedId] = useState('')
  const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null)
  const [mappingBankInspection, setMappingBankInspection] = useState<MappingBankInspection | null>(null)
  const [mappingBankDecisions, setMappingBankDecisions] = useState<Record<string, MappingBankDecision>>({})
  const [mappingAllowMissingBankAccounts, setMappingAllowMissingBankAccounts] = useState(false)
  const [output2BankMissing, setOutput2BankMissing] = useState<PayrollEmployee[]>([])
  const [output2BankAccounts, setOutput2BankAccounts] = useState<Record<string, string>>({})
  const [pendingFactorySwitch, setPendingFactorySwitch] = useState<FactoryMode | null>(null)
  const [smartSettingsOpen, setSmartSettingsOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [smartScanEnabled, setSmartScanEnabled] = useState(() => readSmartSettings().smartScan)
  const [smartMappingEnabled, setSmartMappingEnabled] = useState(() => readSmartSettings().smartMapping)
  const [newcomerBenefitEnabled, setNewcomerBenefitEnabled] = useState(() => readSmartSettings().newcomerBenefit)
  const [showNewcomerBenefitReview, setShowNewcomerBenefitReview] = useState(() => readSmartSettings().showNewcomerBenefitReview)
  const [showWorkDetail, setShowWorkDetail] = useState(() => readSmartSettings().showWorkDetail)
  const [showManualChecks, setShowManualChecks] = useState(() => readSmartSettings().showManualChecks)
  const [showEmployeeList, setShowEmployeeList] = useState(() => readSmartSettings().showEmployeeList)
  const [manualEntryLocked, setManualEntryLocked] = useState(() => readSmartSettings().manualEntryLocked)
  const [legacyConverterEnabled, setLegacyConverterEnabled] = useState(() => readSmartSettings().legacyConverter)
  const [factory2LegacyDialogOpen, setFactory2LegacyDialogOpen] = useState(false)
  const [factory2LegacyFile, setFactory2LegacyFile] = useState<File | null>(null)
  const [factory2LegacyOutputKind, setFactory2LegacyOutputKind] = useState<'output1' | 'output2'>('output2')
  const [factory2LegacyLoading, setFactory2LegacyLoading] = useState(false)
  const [factory1LegacyDialogOpen, setFactory1LegacyDialogOpen] = useState(false)
  const [factory1LegacyFile, setFactory1LegacyFile] = useState<File | null>(null)
  const [factory1LegacyLoading, setFactory1LegacyLoading] = useState(false)
  const [cardExportLoading, setCardExportLoading] = useState<'output1' | 'output2' | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [cloudLoading, setCloudLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [cloudConfig, setCloudConfig] = useState<CloudConfig | null>(null)
  const [cloudSubmissions, setCloudSubmissions] = useState<CloudSubmission[]>([])
  const [cloudForm, setCloudForm] = useState<CloudConfigForm>({
    enabled: false,
    supabase_url: '',
    service_role_key: '',
    sync_on_save: false,
    drive_backup_enabled: false,
    drive_backup_dir: '',
    local_export_dir: '',
    backup_on_history_change: true,
  })
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const pendingReviewCount = payrollReviewItems.filter(
    (item) => item.status === 'pending' && (showNewcomerBenefitReview || item.type !== 'newcomer_benefit'),
  ).length
  const currentReviewTableName = 'bảng kiểm tra Output'
  const isOwner = !ROLE_LOGIN_ENABLED || auth?.user.role === 'owner'
  const employeeRegistryForCurrentFactory = mergeEmployeeLists(employeeRegistry, payrollEmployees)
  const currentEmployeeCodes = new Set((data?.blocks ?? []).map((block) => block.employee_code))
  const currentEmployees = payrollEmployees.filter((employee) => currentEmployeeCodes.has(employee.employee_code))
  const payrollSyncPending = Boolean(data && isOwner && data.blocks.length > 0 && payrollEmployees.length === 0)
  const missingPayrollCount = payrollSyncPending
    ? 0
    : currentEmployees.filter(
        (employee) => !isEmployeeProfileEntered(employee) || !(Number(employee.monthly_salary) > 0),
      ).length
  const missingBankCount = currentEmployees.filter(
    (employee) => Number(employee.total_hours || 0) > 0 && !String(employee.bank_account || '').trim(),
  ).length
  const currentHistorySaved = Boolean(
    data?.period.month &&
      data.period.year &&
      historyPeriods.some((period) => period.month === data.period.month && period.year === data.period.year),
  )
  const currentFinalCopySaved = Boolean(
    data?.period.month &&
      data.period.year &&
      historyFinalCopies.some((copy) => copy.month === data.period.month && copy.year === data.period.year),
  )

  function askForConfirmation(options: ConfirmationOptions): Promise<boolean> {
    return new Promise((resolve) => {
      setConfirmationRequest((current) => {
        current?.resolve(false)
        return { ...options, resolve }
      })
    })
  }

  function finishConfirmation(confirmed: boolean) {
    const request = confirmationRequest
    if (!request) return
    setConfirmationRequest(null)
    request.resolve(confirmed)
  }

  useEffect(() => {
    if (!ROLE_LOGIN_ENABLED) return

    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!stored) {
      // Authentication is optional and this state mirrors the one-time local session check.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthLoading(false)
      return
    }

    try {
      const session = JSON.parse(stored) as AuthSession
      setAuthToken(session.access_token)
      axios.get<{ user: AuthUser }>(`${API_BASE}/auth/me`)
        .then((response) => {
          setAuth({ ...session, user: response.data.user })
        })
        .catch(() => {
          clearAuthToken()
          localStorage.removeItem(AUTH_STORAGE_KEY)
        })
        .finally(() => setAuthLoading(false))
    } catch {
      clearAuthToken()
      localStorage.removeItem(AUTH_STORAGE_KEY)
      setAuthLoading(false)
    }
  }, [])

  useEffect(() => {
    if (ROLE_LOGIN_ENABLED && !auth) return
    if (!ROLE_LOGIN_ENABLED) {
      void loadCloudConfig()
      return
    }
    if (auth?.user.role === 'owner') {
      void loadEmployeeRegistry()
      void loadHistoryPeriods()
      void loadAttendanceOverview()
      void loadCloudConfig()
    } else {
      // These resets synchronize the workspace when an authenticated role changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveView('attendance')
      setEmployeeRegistry([])
      setPayrollEmployees([])
      setCloudConfig(null)
      setCloudSubmissions([])
    }
    // Bootstrap is intentionally keyed to the session token; loader functions are recreated on render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.access_token])

  function temporaryWorkspaceSnapshot(): TemporaryWorkspace | null {
    if (!data) return null
    return {
      version: 1,
      calculation_version: workspaceCalculationVersion,
      newcomer_benefit_enabled: newcomerBenefitEnabled,
      show_newcomer_benefit_review: showNewcomerBenefitReview,
      saved_at: new Date().toISOString(),
      factory: data.factory ?? factoryMode,
      data,
      payroll_employees: payrollEmployees,
      review_items: payrollReviewItems,
      review_memory: reviewMemory,
      latest_history_info: latestHistoryInfo,
      known_history_codes: knownHistoryCodes,
      selected_code: selectedCode,
      active_view: activeView,
      period_month: periodMonth,
      period_year: periodYear,
      employee_list_month: employeeListMonth,
      employee_list_year: employeeListYear,
    }
  }

  function cacheTemporaryWorkspace(workspace: TemporaryWorkspace) {
    try {
      localStorage.setItem(temporaryWorkspaceCacheKey(workspace.factory), JSON.stringify(workspace))
    } catch {
      // The backend remains the durable copy when local storage is unavailable
      // or full; caching is only an instant switch-time optimization.
    }
  }

  function applyCachedTemporaryWorkspace(workspace: TemporaryWorkspace) {
    if (workspace.factory !== factoryModeRef.current) return
    const cachedEmployees = workspace.payroll_employees ?? []
    const cachedSelectedEmployee =
      cachedEmployees.find((employee) => employee.employee_code === workspace.selected_code) ?? cachedEmployees[0]
    factoryModeRef.current = workspace.factory
    setFactoryMode(workspace.factory)
    setWorkspaceCalculationVersion(workspace.calculation_version ?? ATTENDANCE_CALCULATION_VERSION)
    setNewcomerBenefitEnabled(workspace.newcomer_benefit_enabled ?? newcomerBenefitEnabled)
    if (workspace.show_newcomer_benefit_review !== undefined) {
      setShowNewcomerBenefitReview(workspace.show_newcomer_benefit_review)
    }
    setData(workspace.data)
    setReviewSourceSessionId(workspace.data.session_id)
    setPayrollReviewItems(
      reconcileTemporaryReviewItems(
        workspace.data,
        workspace.latest_history_info ?? { period: null, employee_codes: [] },
        workspace.known_history_codes ?? [],
        workspace.review_memory ?? null,
        workspace.review_items ?? [],
      ),
    )
    setReviewMemory(workspace.review_memory ?? null)
    setLatestHistoryInfo(workspace.latest_history_info ?? { period: null, employee_codes: [] })
    setKnownHistoryCodes(workspace.known_history_codes ?? [])
    setPayrollEmployees(cachedEmployees)
    setSelectedCode(cachedSelectedEmployee?.employee_code ?? workspace.selected_code ?? '')
    setForm(cachedSelectedEmployee ? formFromEmployee(cachedSelectedEmployee) : emptyPayrollForm())
    setActiveView(workspace.active_view === 'payroll' || workspace.active_view === 'employees' ? workspace.active_view : 'attendance')
    setPeriodMonth(workspace.period_month ?? '')
    setPeriodYear(workspace.period_year ?? '')
    setEmployeeListMonth(workspace.employee_list_month ?? '')
    setEmployeeListYear(workspace.employee_list_year ?? '')
    setRestoredAnalysisFilename(workspace.data.filename)
    setMessage(`Đã mở lại phiên tạm của ${workspace.factory === 'factory1' ? 'Xưởng 1' : 'Xưởng 2'}: ${workspace.data.filename}`)
  }

  async function restoreFactoryDraft(factory: FactoryMode) {
    const cached = readCachedTemporaryWorkspace(factory)
    if (cached) {
      applyCachedTemporaryWorkspace(cached)
      return
    }
    try {
      const response = await axios.get<TemporaryWorkspace>(`${API_BASE}/attendance/temporary-workspace`, {
        params: { factory },
        timeout: WORKSPACE_RESTORE_TIMEOUT_MS,
      })
      const workspace = response.data
      if (workspace.version !== 1 || workspace.factory !== factory || !workspace.data?.session_id) return
      cacheTemporaryWorkspace(workspace)
      if (factoryModeRef.current === factory) applyCachedTemporaryWorkspace(workspace)
    } catch {
      // An empty factory is normal; do not show an error or delay switching.
    }
  }

  useEffect(() => {
    if (ROLE_LOGIN_ENABLED && !auth) return
    let cancelled = false

    async function restoreTemporaryWorkspace() {
      const restoreFactory = factoryModeRef.current
      // Paint the last local snapshot immediately. The backend copy is still
      // authoritative when available, but a missing/slow API must not send the
      // user back to the empty default screen after a reload.
      const cachedWorkspace = readCachedTemporaryWorkspace(restoreFactory)
      if (cachedWorkspace && !cancelled) {
        applyCachedTemporaryWorkspace(cachedWorkspace)
        setWorkspaceHydrated(true)
      }
      try {
        const workspaceResponse = await axios.get<TemporaryWorkspace>(`${API_BASE}/attendance/temporary-workspace`, {
          params: { factory: restoreFactory },
          timeout: WORKSPACE_RESTORE_TIMEOUT_MS,
        })
        const workspace = workspaceResponse.data
        if (workspace.version !== 1 || !workspace.data?.session_id || workspace.factory !== workspace.data.factory) {
          throw new Error('Phiên tạm không hợp lệ')
        }
        cacheTemporaryWorkspace(workspace)

        if (cancelled) return

        const restoredNewcomerBenefit = workspace.newcomer_benefit_enabled ?? newcomerBenefitEnabled
        const workspaceNeedsRecalculation =
          (workspace.calculation_version ?? 0) < ATTENDANCE_CALCULATION_VERSION
        const cachedEmployees = workspace.payroll_employees ?? []
        const cachedSelectedEmployee =
          cachedEmployees.find((employee) => employee.employee_code === workspace.selected_code) ?? cachedEmployees[0]
        factoryModeRef.current = workspace.factory
        setWorkspaceCalculationVersion(workspace.calculation_version ?? 0)
        setNewcomerBenefitEnabled(restoredNewcomerBenefit)
        if (workspace.show_newcomer_benefit_review !== undefined) {
          setShowNewcomerBenefitReview(workspace.show_newcomer_benefit_review)
        }
        setFactoryMode(workspace.factory)
        setData(workspace.data)
        setReviewSourceSessionId(workspace.data.session_id)
        setPayrollReviewItems(
          workspaceNeedsRecalculation
            ? []
            : reconcileTemporaryReviewItems(
                workspace.data,
                workspace.latest_history_info ?? { period: null, employee_codes: [] },
                workspace.known_history_codes ?? [],
                workspace.review_memory ?? null,
                workspace.review_items ?? [],
              ),
        )
        setReviewMemory(workspace.review_memory ?? null)
        setLatestHistoryInfo(workspace.latest_history_info ?? { period: null, employee_codes: [] })
        setKnownHistoryCodes(workspace.known_history_codes ?? [])
        if (cachedEmployees.length) {
          setPayrollEmployees(cachedEmployees)
          setSelectedCode(cachedSelectedEmployee?.employee_code ?? '')
          setForm(cachedSelectedEmployee ? formFromEmployee(cachedSelectedEmployee) : emptyPayrollForm())
        } else {
          setSelectedCode(workspace.selected_code ?? '')
        }
        setActiveView(workspace.active_view === 'payroll' || workspace.active_view === 'employees' ? workspace.active_view : 'attendance')
        setPeriodMonth(workspace.period_month ?? '')
        setPeriodYear(workspace.period_year ?? '')
        setEmployeeListMonth(workspace.employee_list_month ?? '')
        setEmployeeListYear(workspace.employee_list_year ?? '')
        setRestoredAnalysisFilename(workspace.data.filename)
        setMessage(`Đã mở lại phiên tạm: ${workspace.data.filename}`)
        // Chỉ khóa giao diện trong lúc đọc JSON phiên tạm. Tính lại Excel và
        // dựng preview lương là việc nền, không được giữ người dùng ở màn chờ.
        setWorkspaceHydrated(true)

        // The temporary workspace already contains the last complete payroll
        // preview. Re-reading the Excel workbook on every reload is expensive
        // and adds no value until the source or calculation rules change.
        if (cachedEmployees.length && !workspaceNeedsRecalculation) return

        let restoredData = workspace.data
        try {
          if (workspaceNeedsRecalculation) {
            const refreshedResponse = await axios.post<AnalyzeResponse>(
              `${API_BASE}/attendance/session/${workspace.data.session_id}/reanalyze`,
              null,
              { params: { newcomer_benefit: restoredNewcomerBenefit } },
            )
            restoredData = { ...workspace.data, ...refreshedResponse.data }
          }

          // Employee/profile data can change independently after a final copy
          // is saved. Always refresh it when restoring a temporary session;
          // the cached list is only for the first paint while the API loads.
          const response = await axios.get<{ employees: PayrollEmployee[] }>(`${API_BASE}/payroll/employees`, {
            params: { session_id: restoredData.session_id },
          })
          const employees = response.data.employees
          if (cancelled) return

          const selectedEmployee =
            employees.find((employee) => employee.employee_code === workspace.selected_code) ?? employees[0]
          setData(restoredData)
          setWorkspaceCalculationVersion(ATTENDANCE_CALCULATION_VERSION)
          setReviewSourceSessionId(restoredData.session_id)
          setPayrollReviewItems(
            reconcileTemporaryReviewItems(
              restoredData,
              workspace.latest_history_info ?? { period: null, employee_codes: [] },
              workspace.known_history_codes ?? [],
              workspace.review_memory ?? null,
              workspace.review_items ?? [],
              workspaceNeedsRecalculation,
            ),
          )
          setPayrollEmployees(employees)
          setSelectedCode(selectedEmployee?.employee_code ?? '')
          setForm(selectedEmployee ? formFromEmployee(selectedEmployee) : emptyPayrollForm())
          setRestoredAnalysisFilename(restoredData.filename)
          if (workspaceNeedsRecalculation) setMessage(`Đã cập nhật cách tính mới cho: ${restoredData.filename}`)
        } catch {
          if (!cancelled) setMessage('Đã mở dữ liệu đã lưu; phần cập nhật Excel nền chưa hoàn tất nhưng bạn vẫn có thể tiếp tục làm việc.')
        }
      } catch (error) {
        const backendUnavailable = axios.isAxiosError(error) && !error.response
        const noTemporaryWorkspace = axios.isAxiosError(error) && error.response?.status === 404
        if (backendUnavailable) {
          if (!cancelled && !cachedWorkspace) setMessage('Backend chưa sẵn sàng để khôi phục phiên tạm. Hãy tải lại trang sau vài giây.')
        } else if (!noTemporaryWorkspace) {
          void axios.delete(`${API_BASE}/attendance/temporary-workspace`, { params: { factory: restoreFactory } }).catch(() => undefined)
          if (!cancelled) setMessage('Phiên tạm cũ không còn dữ liệu nguồn nên đã được dọn khỏi máy.')
        }
      } finally {
        // Không để lớp màn hình chờ khóa toàn bộ ứng dụng nếu lần gọi khôi
        // phục đầu tiên gặp lỗi mạng ngắn hạn; các bộ dữ liệu khác vẫn có thể tải.
        if (!cancelled) setWorkspaceHydrated(true)
      }
    }

    void restoreTemporaryWorkspace()
    return () => {
      cancelled = true
    }
  // The setting is intentionally read once during bootstrap; later changes reanalyze directly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth])

  useEffect(() => {
    if (!workspaceHydrated) return
    if (data && reviewSourceSessionId === data.session_id) return
    // Review rows are editable derived state and must be reset when their source analysis changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPayrollReviewItems(data ? buildPayrollReviewItems(data, latestHistoryInfo, knownHistoryCodes, reviewMemory) : [])
    setReviewSourceSessionId(data?.session_id ?? '')
  }, [data, latestHistoryInfo, knownHistoryCodes, reviewMemory, reviewSourceSessionId, workspaceHydrated])

  useEffect(() => {
    if (!workspaceHydrated) return
    const workspace = temporaryWorkspaceSnapshot()
    // Switching factories temporarily clears the visible data. That is not a
    // deletion: the per-factory draft stays in its own cache until a new file
    // is selected for that factory.
    if (!workspace) return
    const saveTimer = window.setTimeout(() => {
      cacheTemporaryWorkspace(workspace)
      void axios.put(`${API_BASE}/attendance/temporary-workspace`, workspace).catch(() => undefined)
    }, 180)
    return () => window.clearTimeout(saveTimer)
  // The snapshot builder intentionally reads the complete workspace state;
  // listing it as a dependency would recreate the save timer on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeView,
    data,
    employeeListMonth,
    employeeListYear,
    factoryMode,
    knownHistoryCodes,
    latestHistoryInfo,
    newcomerBenefitEnabled,
    payrollEmployees,
    showNewcomerBenefitReview,
    payrollReviewItems,
    periodMonth,
    periodYear,
    reviewMemory,
    selectedCode,
    workspaceHydrated,
    workspaceCalculationVersion,
  ])

  useEffect(() => {
    if (ROLE_LOGIN_ENABLED && auth?.user.role !== 'owner') return
    const selectedFactory = factoryMode
    void loadEmployeeRegistry(selectedCode, selectedFactory)
    void loadHistoryPeriods(historyFilters, selectedFactory)
    void loadAttendanceOverview(attendanceOverviewYear, selectedFactory)
    void fetchKnownHistoryCodes(selectedFactory)
      .then((codes) => {
        if (factoryModeRef.current === selectedFactory) setKnownHistoryCodes(codes)
      })
      .catch(() => {
        if (factoryModeRef.current === selectedFactory) setKnownHistoryCodes([])
      })
    // Factory switching is the trigger; including loader functions would retrigger this effect every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factoryMode])

  useEffect(() => {
    localStorage.setItem(
      SMART_SETTINGS_KEY,
      JSON.stringify({
        smartScan: smartScanEnabled,
        smartMapping: smartMappingEnabled,
        newcomerBenefit: newcomerBenefitEnabled,
        showNewcomerBenefitReview,
        showWorkDetail,
        showManualChecks,
        showEmployeeList,
        manualEntryLocked,
        legacyConverter: legacyConverterEnabled,
        // Keep the old key so an older browser session can still read the
        // setting after an upgrade.
        factory2LegacyConverter: legacyConverterEnabled,
      }),
    )
  }, [smartScanEnabled, smartMappingEnabled, newcomerBenefitEnabled, showNewcomerBenefitReview, showWorkDetail, showManualChecks, showEmployeeList, manualEntryLocked, legacyConverterEnabled])

  async function login() {
    setLoginLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.post<AuthSession>(`${API_BASE}/auth/login`, loginForm)
      setAuthToken(response.data.access_token)
      setAuth(response.data)
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(response.data))
      setLoginForm((current) => ({ ...current, password: '' }))
    } catch (err) {
      setError(readAxiosError(err, 'Không đăng nhập được'))
    } finally {
      setLoginLoading(false)
      setAuthLoading(false)
    }
  }

  function logout() {
    clearAuthToken()
    localStorage.removeItem(AUTH_STORAGE_KEY)
    setAuth(null)
    setData(null)
    setPayrollEmployees([])
    setEmployeeRegistry([])
    setPayrollReviewItems([])
    setHistoryPeriods([])
    setHistoryFinalCopies([])
    setHistoryDetail(null)
    setSelectedPeriodId('')
    setSelectedFinalCopyId('')
    setActiveView('attendance')
    setMessage(null)
    setError(null)
  }

  function clearTemporaryAnalysis(keepSelectedFile = false) {
    const temporarySessionId = data?.session_id
    if (temporarySessionId) {
      void axios.delete(`${API_BASE}/attendance/session/${temporarySessionId}`).catch(() => undefined)
    }
    void axios.delete(`${API_BASE}/attendance/temporary-workspace`, { params: { factory: factoryMode } }).catch(() => undefined)
    localStorage.removeItem(temporaryWorkspaceCacheKey(factoryMode))
    if (!keepSelectedFile) setFile(null)
    resetTemporaryAnalysisView()
  }

  function resetTemporaryAnalysisView() {
    setData(null)
    setReviewSourceSessionId('')
    setRestoredAnalysisFilename('')
    setPayrollEmployees([])
    setPayrollReviewItems([])
    setReviewMemory(null)
    setSelectedCode('')
    setForm(emptyPayrollForm())
    setPeriodMonth('')
    setPeriodYear('')
    setEmployeeListMonth('')
    setEmployeeListYear('')
  }

  function hideTemporaryAnalysis() {
    setFile(null)
    resetTemporaryAnalysisView()
  }

  async function inspectSelectedFile(selectedFile: File, role: WorkbookRole): Promise<FileInspection | null> {
    const lowerName = selectedFile.name.toLowerCase()
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xlsm')) {
      setError(`File "${selectedFile.name}" không đúng định dạng. Chỉ nhận .xlsx hoặc .xlsm.`)
      setMessage(null)
      return null
    }

    setFileInspectingRole(role)
    setError(null)
    setMessage(null)
    try {
      const uploadForm = new FormData()
      uploadForm.append('file', selectedFile)
      uploadForm.append('role', role)
      uploadForm.append('factory', factoryMode)
      const response = await axios.post<FileInspection>(`${API_BASE}/attendance/inspect-file`, uploadForm)
      const periodText = response.data.period_label ? ` · kỳ ${response.data.period_label}` : ''
      setMessage(`Đã nhận diện đúng file · ${response.data.employee_count} mã${periodText}.`)
      return response.data
    } catch (err) {
      setError(readAxiosError(err, `File "${selectedFile.name}" không phù hợp với ô đã chọn`))
      return null
    } finally {
      setFileInspectingRole(null)
    }
  }

  async function selectAnalysisFile(selectedFile: File | null) {
    setError(null)
    setMessage(null)
    if (!selectedFile) {
      setFile(null)
      return
    }
    if (
      data &&
      !(await askForConfirmation({
        kicker: 'BỎ PHIÊN TẠM',
        title: 'Bạn muốn chọn file mới?',
        message: `Bạn đang có một phiên phân tích tạm chưa lưu vào lịch sử.\n\nChọn file mới sẽ bỏ toàn bộ phần đang làm dở của ${data.filename}.`,
        confirmLabel: 'Chọn file mới',
      }))
    ) {
      return
    }
    clearTemporaryAnalysis()
    if (!smartScanEnabled) {
      if (!isExcelFile(selectedFile)) {
        setError(`File "${selectedFile.name}" không đúng định dạng. Chỉ nhận .xlsx hoặc .xlsm.`)
        return
      }
      setFile(selectedFile)
      return
    }
    if (await inspectSelectedFile(selectedFile, 'analysis')) {
      setFile(selectedFile)
    }
  }

  async function selectMappingFile(selectedFile: File | null, role: 'mapping_current' | 'mapping_previous') {
    if (role === 'mapping_current') setMappingCurrentFile(null)
    else setMappingPreviousFile(null)
    setError(null)
    setMessage(null)
    if (!selectedFile) return
    if (!smartScanEnabled) {
      if (!isExcelFile(selectedFile)) {
        setError(`File "${selectedFile.name}" không đúng định dạng. Chỉ nhận .xlsx hoặc .xlsm.`)
        return
      }
      if (role === 'mapping_current') setMappingCurrentFile(selectedFile)
      else setMappingPreviousFile(selectedFile)
      return
    }
    if (await inspectSelectedFile(selectedFile, role)) {
      if (role === 'mapping_current') setMappingCurrentFile(selectedFile)
      else setMappingPreviousFile(selectedFile)
    }
  }

  async function selectRecalculateFile(selectedFile: File | null) {
    setRecalculateFile(null)
    setError(null)
    setMessage(null)
    if (!selectedFile) return
    if (!smartScanEnabled) {
      if (!isExcelFile(selectedFile)) {
        setError(`File "${selectedFile.name}" không đúng định dạng. Chỉ nhận .xlsx hoặc .xlsm.`)
        return
      }
      setRecalculateFile(selectedFile)
      return
    }
    const role: WorkbookRole = recalculateOutputKind === 'output2' ? 'recalculate_output2' : 'recalculate_output1'
    if (await inspectSelectedFile(selectedFile, role)) {
      setRecalculateFile(selectedFile)
    }
  }

  function changeRecalculateOutputKind(kind: 'output1' | 'output2') {
    if (kind === recalculateOutputKind) return
    setRecalculateOutputKind(kind)
    setRecalculateFile(null)
    setError(null)
    setMessage('Đã đổi loại Output. Vui lòng chọn lại file để hệ thống kiểm tra đúng cấu trúc.')
  }

  function cancelAnalysis() {
    if (!analysisAbortControllerRef.current) return
    const requestId = analysisRequestIdRef.current
    if (requestId && !analysisCommittedRef.current) {
      void axios.post(`${API_BASE}/attendance/analyze/cancel`, null, { params: { request_id: requestId } }).catch(() => undefined)
    }
    analysisAbortControllerRef.current.abort()
    setMessage(
      analysisCommittedRef.current
        ? 'Đã dừng tải phần bổ sung. Phiên phân tích đã được lưu.'
        : 'Đã hủy phân tích. File chưa được lưu vào phiên tạm.',
    )
    setError(null)
  }

  async function analyze() {
    if (!file) return
    if (analysisAbortControllerRef.current) return

    if (
      data &&
      !(await askForConfirmation({
        kicker: 'PHÂN TÍCH LẠI',
        title: 'Bỏ phiên tạm hiện tại?',
        message: `Phân tích lại sẽ thay thế phiên tạm đang làm dở của ${data.filename}.`,
        confirmLabel: 'Phân tích lại',
      }))
    ) {
      return
    }
    if (data) clearTemporaryAnalysis(true)

    setLoading(true)
    setError(null)
    setMessage(null)

    const controller = new AbortController()
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    analysisAbortControllerRef.current = controller
    analysisRequestIdRef.current = requestId
    analysisCommittedRef.current = false
    let timedOut = false
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      if (!analysisCommittedRef.current) {
        void axios.post(`${API_BASE}/attendance/analyze/cancel`, null, { params: { request_id: requestId } }).catch(() => undefined)
      }
      controller.abort()
    }, ANALYSIS_TIMEOUT_MS)
    const requestConfig: AnalysisRequestConfig = {
      signal: controller.signal,
      timeout: ANALYSIS_TIMEOUT_MS,
      requestId,
    }

    try {
      const [latestInfo, knownCodes] = await Promise.all([
        fetchLatestHistoryInfo(requestConfig),
        fetchKnownHistoryCodes(factoryMode, requestConfig),
      ])
      let response = await postAnalyze(false, requestConfig)
      let responseData = response.data

      if (isNormalizationRequired(responseData)) {
        const retainedCount = responseData.retained_employee_count ?? responseData.raw_employee_count
        const discardedCount = responseData.discarded_empty_employee_count ?? 0
        const filterLine = discardedCount
          ? `App sẽ giữ ${retainedCount} mã có giờ chấm công và bỏ ${discardedCount} mã rỗng.\n\n`
          : ''
        const shouldNormalize = await askForConfirmation({
          kicker: 'CHUẨN HÓA FILE RAW',
          title: 'Bổ sung khung trước khi phân tích?',
          message:
            `Phát hiện file raw từ máy chấm công, chưa có khung nhập phân tích.\n\n` +
            `App cần tự động bổ sung khung cho ${responseData.raw_employee_count} mã nhân viên trước khi phân tích.\n\n` +
            filterLine,
          confirmLabel: 'Bổ sung và tiếp tục',
        })

        if (!shouldNormalize) {
          void discardPendingAnalysis(responseData.resume_token)
          setMessage('Đã hủy phân tích vì file raw chưa có khung nhập.')
          return
        }

        if (controller.signal.aborted) return
        response = await continueAnalyze(responseData.resume_token, requestConfig)
        responseData = response.data
      }

      if (isNormalizationRequired(responseData)) {
        setError('File vẫn chưa có khung nhập sau bước chuẩn hóa.')
        return
      }

      analysisCommittedRef.current = true

      setLatestHistoryInfo(latestInfo)
      setKnownHistoryCodes(knownCodes)
      setData(responseData)
      setWorkspaceCalculationVersion(ATTENDANCE_CALCULATION_VERSION)
      setReviewMemory({ period: null, records: [] })
      setPayrollReviewItems([])
      setReviewSourceSessionId(responseData.session_id)
      setRestoredAnalysisFilename(responseData.filename)
      setPeriodMonth(responseData.period?.month ? String(responseData.period.month) : '')
      setPeriodYear(responseData.period?.year ? String(responseData.period.year) : '')
      setEmployeeListMonth(responseData.period?.month ? String(responseData.period.month) : '')
      setEmployeeListYear(responseData.period?.year ? String(responseData.period.year) : '')
      setActiveView('attendance')
      // Core Excel analysis is complete. Show the result immediately while
      // the independent review/payroll data finishes loading.
      setLoading(false)
      const memoryPromise = fetchReviewMemory(responseData.period, requestConfig)
      const payrollPromise = isOwner
        ? refreshPayroll(responseData.session_id, true, requestConfig)
        : Promise.resolve()
      const memory = await memoryPromise
      await payrollPromise
      const reviewItems = buildPayrollReviewItems(responseData, latestInfo, knownCodes, memory)
      setReviewMemory(memory)
      setPayrollReviewItems(reviewItems)
      const infoMessages: string[] = []
      if (responseData.factory === 'factory2') {
        const sourceCount = responseData.normalization_summary?.raw_employee_count ?? responseData.summary.blocks
        const activeCount = responseData.normalization_summary?.retained_employee_count ?? responseData.summary.blocks
        const emptyCount = responseData.normalization_summary?.discarded_empty_employee_count ?? 0
        if (sourceCount > 0) {
          infoMessages.push(
            emptyCount > 0
              ? `Đã đọc bảng Xưởng 2: có ${activeCount} mã có công trong tổng số ${sourceCount} mã; ${emptyCount} mã không có giờ chấm được bỏ qua.`
              : `Đã đọc bảng Xưởng 2: cả ${activeCount} mã đều có dữ liệu chấm công.`,
          )
        }
      }
      if (responseData.normalized_raw) {
        const discardedCount = responseData.normalization_summary?.discarded_empty_employee_count ?? 0
        const retainedCount = responseData.normalization_summary?.retained_employee_count ?? responseData.summary.blocks
        infoMessages.push(
          discardedCount
            ? `Đã bổ sung khung nhập, giữ ${retainedCount} mã có giờ chấm công và bỏ ${discardedCount} mã rỗng.`
            : 'Đã bổ sung khung nhập cho file raw và phân tích xong.',
        )
      }
      if (responseData.missing_output1_summary) {
        infoMessages.push('Thông tin: file gốc chưa có 3 cột Output 1 (Tổng giờ công, Mã, Tên nhân viên / Ghi chú); app sẽ tự bổ sung khi xuất.')
      }
      const appliedReviewCount = reviewItems.filter((item) => item.origin === 'history-applied').length
      const ruleChangedReviewCount = reviewItems.filter((item) => item.type === 'rule_change').length
      if (appliedReviewCount > 0) {
        infoMessages.push(`Đã áp dụng ${appliedReviewCount} xác nhận cũ từ lịch sử.`)
      }
      if (ruleChangedReviewCount > 0) {
        infoMessages.push(`Có ${ruleChangedReviewCount} dòng đổi công do rule mới cần xác nhận.`)
      }
      if (infoMessages.length) {
        setMessage(infoMessages.join(' '))
      }
    } catch (err) {
      const analysisWasCommitted = analysisCommittedRef.current
      const requestTimedOut = timedOut || (axios.isAxiosError(err) && ['ECONNABORTED', 'ETIMEDOUT'].includes(err.code || ''))
      if (requestTimedOut) {
        setError(
          analysisWasCommitted
            ? 'Phân tích đã xong nhưng tải phần hiển thị quá lâu. Phiên tạm đã được lưu, bạn có thể tải lại trang.'
            : 'Phân tích quá lâu nên app đã tự dừng. File chưa được lưu; bạn có thể thử lại với file nhỏ hơn.',
        )
      } else if (controller.signal.aborted || axios.isCancel(err)) {
        setMessage(
          analysisWasCommitted
            ? 'Đã dừng tải phần bổ sung. Phiên phân tích đã được lưu.'
            : 'Đã hủy phân tích. File chưa được lưu vào phiên tạm.',
        )
      } else {
        setError(
          readAxiosError(
            err,
            analysisWasCommitted ? 'Phân tích đã lưu nhưng chưa tải đủ dữ liệu hiển thị' : 'Không phân tích được file',
          ),
        )
      }
    } finally {
      window.clearTimeout(timeoutId)
      if (analysisAbortControllerRef.current === controller) analysisAbortControllerRef.current = null
      if (analysisRequestIdRef.current === requestId) analysisRequestIdRef.current = null
      analysisCommittedRef.current = false
      setLoading(false)
    }
  }

  function postAnalyze(
    normalizeRaw: boolean,
    requestConfig?: AnalysisRequestConfig,
    scanWorkbook = smartScanEnabled,
  ) {
    if (!file) throw new Error('Chưa chọn file Excel')

    const uploadForm = new FormData()
    uploadForm.append('file', file)
    uploadForm.append('normalize_raw', String(normalizeRaw))
    uploadForm.append('factory', factoryMode)
    uploadForm.append('smart_scan', String(scanWorkbook))
    uploadForm.append('newcomer_benefit', String(newcomerBenefitEnabled))
    if (requestConfig?.requestId) uploadForm.append('request_id', requestConfig.requestId)
    return axios.post<AnalyzeResponse | NormalizationRequiredResponse>(`${API_BASE}/attendance/analyze`, uploadForm, {
      signal: requestConfig?.signal,
      timeout: requestConfig?.timeout,
    })
  }

  function continueAnalyze(resumeToken: string, requestConfig?: AnalysisRequestConfig) {
    const continueForm = new FormData()
    continueForm.append('resume_token', resumeToken)
    continueForm.append('newcomer_benefit', String(newcomerBenefitEnabled))
    if (requestConfig?.requestId) continueForm.append('request_id', requestConfig.requestId)
    return axios.post<AnalyzeResponse>(`${API_BASE}/attendance/analyze/continue`, continueForm, {
      signal: requestConfig?.signal,
      timeout: requestConfig?.timeout,
    })
  }

  function discardPendingAnalysis(resumeToken: string) {
    return axios.delete(`${API_BASE}/attendance/analyze/pending/${resumeToken}`)
  }

  async function changeNewcomerBenefitEnabled(enabled: boolean) {
    const previous = newcomerBenefitEnabled
    setError(null)
    setMessage(null)

    if (!data?.session_id) {
      setNewcomerBenefitEnabled(enabled)
      if (enabled) setShowNewcomerBenefitReview(true)
      setMessage(enabled ? 'Đã bật quyền lợi ngày đầu cho lần phân tích tiếp theo.' : 'Đã tắt quyền lợi ngày đầu cho lần phân tích tiếp theo.')
      return
    }

    setLoading(true)
    try {
      const response = await axios.post<AnalyzeResponse>(
        `${API_BASE}/attendance/session/${data.session_id}/reanalyze`,
        null,
        { params: { newcomer_benefit: enabled } },
      )
      const refreshedData = { ...data, ...response.data }
      setNewcomerBenefitEnabled(enabled)
      if (enabled) setShowNewcomerBenefitReview(true)
      setData(refreshedData)
      setWorkspaceCalculationVersion(ATTENDANCE_CALCULATION_VERSION)
      setPayrollReviewItems(buildPayrollReviewItems(refreshedData, latestHistoryInfo, knownHistoryCodes, reviewMemory))
      setReviewSourceSessionId(refreshedData.session_id)
      if (isOwner) await refreshPayroll(refreshedData.session_id, false)
      setMessage(
        enabled
          ? 'Đã bật quyền lợi ngày đầu và tính lại phiên đang mở.'
          : 'Đã tắt quyền lợi ngày đầu và tính lại phiên đang mở; giờ công không còn được tự cộng mốc chuẩn.',
      )
    } catch (err) {
      setNewcomerBenefitEnabled(previous)
      setError(readAxiosError(err, 'Không thể tính lại phiên với cài đặt ngày đầu mới'))
    } finally {
      setLoading(false)
    }
  }

  async function recalculateEditedWorkbook() {
    if (!recalculateFile) return

    setRecalculateLoading(true)
    setError(null)
    setMessage(null)
    try {
      const safeOutputKind = isOwner ? recalculateOutputKind : 'output1'
      const uploadForm = new FormData()
      uploadForm.append('file', recalculateFile)
      uploadForm.append('output_kind', safeOutputKind)
      uploadForm.append('factory', factoryMode)
      uploadForm.append('smart_scan', String(smartScanEnabled))
      const response = await axios.post(`${API_BASE}/attendance/recalculate-totals`, uploadForm, {
        responseType: 'blob',
      })
      const extension = recalculateFile.name.toLowerCase().endsWith('.xlsm') ? 'xlsm' : 'xlsx'
      const content = safeOutputKind === 'output1' ? 'Output1' : 'Output2'
      downloadBlob(
        response.data,
        readableSourceExportFilename(factoryMode, recalculateFile.name, content, extension),
      )
      setMessage(`Đã tính lại tổng công và xuất ${safeOutputKind === 'output1' ? 'Output 1' : 'Output 2'}`)
    } catch (err) {
      setError(await readAxiosErrorAsync(err, 'Không tính lại tổng công được'))
    } finally {
      setRecalculateLoading(false)
    }
  }

  async function finishOwnerMapping(
    bankUpdates: Array<{ employee_code: string; account_number: string; name: string }>,
    allowMissingBankAccounts: boolean,
  ) {
    if (!mappingCurrentFile || !mappingPreviousFile) return

    setMappingLoading(true)
    setError(null)
    setMessage(null)
    try {
      const uploadForm = new FormData()
      uploadForm.append('current_file', mappingCurrentFile)
      uploadForm.append('previous_file', mappingPreviousFile)
      uploadForm.append('factory', factoryMode)
      uploadForm.append('smart_scan', String(smartScanEnabled))
      uploadForm.append('smart_mapping', String(smartMappingEnabled))
      uploadForm.append('bank_updates', JSON.stringify(bankUpdates))
      uploadForm.append('allow_missing_bank_accounts', String(allowMissingBankAccounts))
      const response = await axios.post(`${API_BASE}/attendance/map-owner-data`, uploadForm, {
        responseType: 'blob',
      })
      downloadBlob(
        response.data,
        readableSourceExportFilename(factoryMode, mappingCurrentFile.name, 'Output1_Output2', 'zip'),
      )
      const summary = readMappingSummary(response.headers['x-mapping-summary'])
      setMappingBankInspection(null)
      setMappingBankDecisions({})
      setMappingAllowMissingBankAccounts(false)
      setMessage(mappingSummaryMessage(summary))
    } catch (err) {
      setError(await readAxiosErrorAsync(err, 'Không gán được dữ liệu'))
    } finally {
      setMappingLoading(false)
    }
  }

  async function mapOwnerData() {
    if (!mappingCurrentFile || !mappingPreviousFile) return

    setMappingLoading(true)
    setError(null)
    setMessage(null)
    try {
      const uploadForm = new FormData()
      uploadForm.append('current_file', mappingCurrentFile)
      uploadForm.append('previous_file', mappingPreviousFile)
      uploadForm.append('factory', factoryMode)
      uploadForm.append('smart_scan', String(smartScanEnabled))
      uploadForm.append('smart_mapping', String(smartMappingEnabled))
      const response = await axios.post<MappingBankInspection>(`${API_BASE}/attendance/map-owner-data/inspect`, uploadForm)
      if (response.data.missing_count || response.data.changed_count) {
        const decisions: Record<string, MappingBankDecision> = {}
        for (const item of response.data.missing_bank_accounts) {
          decisions[item.employee_code] = { mode: 'custom', account: '' }
        }
        for (const item of response.data.changed_bank_accounts) {
          decisions[item.employee_code] = { mode: 'keep', account: item.saved_account }
        }
        setMappingBankInspection(response.data)
        setMappingBankDecisions(decisions)
        setMappingAllowMissingBankAccounts(false)
        return
      }
      await finishOwnerMapping([], true)
    } catch (err) {
      setError(await readAxiosErrorAsync(err, 'Không kiểm tra được dữ liệu tài khoản trước khi gán'))
    } finally {
      setMappingLoading(false)
    }
  }

  async function confirmOwnerMappingBankAccounts() {
    if (!mappingBankInspection) return
    const updates: Array<{ employee_code: string; account_number: string; name: string }> = []
    for (const item of [...mappingBankInspection.missing_bank_accounts, ...mappingBankInspection.changed_bank_accounts]) {
      const decision = mappingBankDecisions[item.employee_code]
      const account = decision?.mode === 'candidate'
        ? item.candidate_account
        : decision?.mode === 'custom'
          ? decision.account.replace(/\D/g, '')
          : ''
      if (account) {
        if (account.length < 8 || account.length > 20) {
          setError(`Số tài khoản của mã ${item.employee_code} phải có từ 8 đến 20 chữ số.`)
          return
        }
        updates.push({ employee_code: item.employee_code, account_number: account, name: item.name })
      }
    }
    const unresolvedMissing = mappingBankInspection.missing_bank_accounts.filter((item) => {
      const decision = mappingBankDecisions[item.employee_code]
      return !(decision?.mode === 'candidate' ? item.candidate_account : decision?.mode === 'custom' ? decision.account.replace(/\D/g, '') : '')
    })
    if (unresolvedMissing.length && !mappingAllowMissingBankAccounts) {
      setError(`Còn ${unresolvedMissing.length} mã thiếu số tài khoản. Hãy nhập đủ hoặc bật “Cho phép gán tạm mã thiếu”.`)
      return
    }
    await finishOwnerMapping(updates, mappingAllowMissingBankAccounts)
  }

  function isNormalizationRequired(
    response: AnalyzeResponse | NormalizationRequiredResponse,
  ): response is NormalizationRequiredResponse {
    return 'requires_normalization' in response && response.requires_normalization === true
  }

  async function refreshPayroll(
    sessionId = data?.session_id,
    syncSelection = true,
    requestConfig?: AnalysisRequestConfig,
  ) {
    if (!sessionId) return

    const response = await axios.get<{ employees: PayrollEmployee[] }>(`${API_BASE}/payroll/employees`, {
      params: { session_id: sessionId },
      signal: requestConfig?.signal,
      timeout: requestConfig?.timeout,
    })
    const employees = response.data.employees
    setPayrollEmployees(employees)
    if (!syncSelection) return

    const nextEmployee =
      employees.find((employee) => employee.employee_code === selectedCode) ?? employees[0]
    setSelectedCode(nextEmployee?.employee_code ?? '')
    setForm(nextEmployee ? formFromEmployee(nextEmployee) : emptyPayrollForm())
  }

  async function loadEmployeeRegistry(selectCode = selectedCode, factory = factoryMode) {
    const response = await axios.get<{ employees: PayrollEmployee[] }>(`${API_BASE}/payroll/employees`, {
      params: { factory },
    })
    if (factoryModeRef.current !== factory) return
    const employees = response.data.employees
    setEmployeeRegistry(employees)
    if (!data) {
      const nextEmployee = employees.find((employee) => employee.employee_code === selectCode) ?? employees[0]
      setSelectedCode(nextEmployee?.employee_code ?? '')
      setForm(nextEmployee ? formFromEmployee(nextEmployee) : emptyPayrollForm())
    }
  }

  async function fetchLatestHistoryInfo(requestConfig?: AnalysisRequestConfig) {
    const response = await axios.get<LatestHistoryInfo>(`${API_BASE}/history/latest-period`, {
      params: { factory: factoryMode },
      signal: requestConfig?.signal,
      timeout: requestConfig?.timeout,
    })
    return response.data
  }

  async function fetchKnownHistoryCodes(factory = factoryMode, requestConfig?: AnalysisRequestConfig) {
    const response = await axios.get<{ employee_codes: string[] }>(`${API_BASE}/history/employee-codes`, {
      params: { factory },
      signal: requestConfig?.signal,
      timeout: requestConfig?.timeout,
    })
    return response.data.employee_codes
  }

  async function fetchReviewMemory(period: PeriodInfo, requestConfig?: AnalysisRequestConfig): Promise<ReviewMemory | null> {
    if (!period.month || !period.year) return null
    const response = await axios.get<ReviewMemory>(`${API_BASE}/history/review-memory`, {
      params: { month: period.month, year: period.year, factory: factoryMode },
      signal: requestConfig?.signal,
      timeout: requestConfig?.timeout,
    })
    return response.data.period ? response.data : null
  }

  function selectEmployee(code: string) {
    const employee = payrollEmployees.find((item) => item.employee_code === code)
    setSelectedCode(code)
    setForm(employee ? formFromEmployee(employee) : emptyPayrollForm())
  }

  function selectRegistryEmployee(code: string) {
    const employee = employeeRegistry.find((item) => item.employee_code === code)
    setSelectedCode(code)
    setForm(employee ? formFromEmployee(employee) : { ...emptyPayrollForm(), employee_code: code })
  }

  function changeFactoryMode(nextMode: FactoryMode) {
    if (nextMode === factoryMode) return
    if (data) {
      setPendingFactorySwitch(nextMode)
      return
    }
    applyFactoryMode(nextMode)
  }

  function applyFactoryMode(nextMode: FactoryMode) {
    const currentWorkspace = temporaryWorkspaceSnapshot()
    if (currentWorkspace) cacheTemporaryWorkspace(currentWorkspace)
    hideTemporaryAnalysis()
    setMappingCurrentFile(null)
    setMappingPreviousFile(null)
    setRecalculateFile(null)
    setFinalCopyFile(null)
    setFactory2LegacyFile(null)
    setFactory2LegacyDialogOpen(false)
    setFactory1LegacyFile(null)
    setFactory1LegacyDialogOpen(false)
    factoryModeRef.current = nextMode
    localStorage.setItem('attendance-current-factory', nextMode)
    setFactoryMode(nextMode)
    setHistoryPeriods([])
    setHistoryFinalCopies([])
    setHistoryDetail(null)
    setHistorySearchResults([])
    setSelectedPeriodId('')
    setSelectedFinalCopyId('')
    setAttendanceOverview(null)
    setCloudSubmissions([])
    setEmployeeRegistry([])
    setPayrollEmployees([])
    setSelectedCode('')
    setError(null)
    setMessage(null)
    setActiveView(isOwner ? 'employees' : 'attendance')
    void restoreFactoryDraft(nextMode)
  }

  function confirmFactorySwitch() {
    if (!pendingFactorySwitch) return
    const nextMode = pendingFactorySwitch
    setPendingFactorySwitch(null)
    applyFactoryMode(nextMode)
  }

  function createRegistryEmployee() {
    setSelectedCode('')
    setForm(emptyPayrollForm())
  }

  function changeManualPayrollForm(nextForm: PayrollForm) {
    if (manualEntryLocked) {
      showManualEntryLockedMessage()
      return
    }
    setForm({ ...nextForm, name: normalizeEmployeeName(nextForm.name) })
  }

  function showManualEntryLockedMessage() {
    setError('Bạn đã khóa nhập thủ công. Muốn sửa thông tin, hãy vào Cài đặt và tắt “Khóa nhập thủ công”.')
  }

  async function savePayroll() {
    if (!form.employee_code) return
    if (manualEntryLocked) {
      showManualEntryLockedMessage()
      return
    }

    setPayrollLoading(true)
    setError(null)
    setMessage(null)
    try {
      await axios.post(`${API_BASE}/payroll/save`, payrollPayload(form, factoryMode))
      await loadEmployeeRegistry(form.employee_code)
      await refreshPayroll(undefined, activeView === 'payroll')
      await loadAttendanceOverview(attendanceOverviewYear)
      if (selectedPeriodId) {
        await loadHistoryDetail(selectedPeriodId, historySelectedCode)
      }
      setMessage(`Đã lưu thông tin nhân viên cho mã ${form.employee_code}`)
    } catch (err) {
      setError(readAxiosError(err, 'Không lưu được thông tin lương'))
    } finally {
      setPayrollLoading(false)
    }
  }

  async function savePayrollPatches(updates: PayrollPatchUpdate[]) {
    if (!updates.length) return
    if (manualEntryLocked) {
      showManualEntryLockedMessage()
      return
    }

    setPayrollLoading(true)
    setError(null)
    setMessage(null)
    try {
      await Promise.all(
        updates.map(({ employeeCode, patch }) => {
          const employee = payrollEmployees.find((item) => item.employee_code === employeeCode)
          if (!employee) return Promise.resolve()

          const payload = payrollPayload({ ...formFromEmployee(employee), ...patch }, factoryMode)

          return axios.post(`${API_BASE}/payroll/save`, payload)
        }),
      )
      await loadEmployeeRegistry()
      await refreshPayroll()
      await loadAttendanceOverview(attendanceOverviewYear)
      setMessage(`Đã áp dụng ${updates.length} thay đổi`)
    } catch (err) {
      setError(readAxiosError(err, 'Không lưu được thông tin lương'))
      throw err
    } finally {
      setPayrollLoading(false)
    }
  }

  function exportOutput2() {
    if (!data) return
    setOutput2ChoiceOpen(true)
  }

  async function exportOutput2File(includeSavedData: boolean) {
    if (!data) return
    setPayrollLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.post(
        `${API_BASE}/payroll/export-output-2`,
        {
          session_id: data!.session_id,
          review_overrides: buildReviewOverrides(payrollReviewItems),
          include_saved_data: includeSavedData,
        },
        { responseType: 'blob' },
      )
      downloadBlob(
        response.data,
        readablePeriodExportFilename(data!.factory ?? factoryMode, data!.period, 'Output2', 'xlsx'),
      )
      setMessage(
        data!.missing_output1_summary
          ? `Đã xuất Output 2 ${includeSavedData ? 'có dữ liệu đã lưu' : 'chỉ giữ công thức'} và bổ sung vùng cột công/lương bên phải.`
          : `Đã xuất Output 2 ${includeSavedData ? 'có dữ liệu đã lưu' : 'chỉ giữ công thức'}.`,
      )
    } catch (err) {
      setError(readAxiosError(err, 'Không xuất được Output 2'))
    } finally {
      setPayrollLoading(false)
    }
  }

  async function runOutput2Export(includeSavedData: boolean) {
    if (!data) return
    if (pendingReviewCount > 0) {
      setPayrollLoading(true)
      const confirmed = await askForConfirmation({
        kicker: 'KIỂM TRA TRƯỚC KHI XUẤT',
        title: 'Vẫn xuất Output 2?',
        message: `Còn ${pendingReviewCount} mục đi trễ/quên bấm/chưa rõ chưa được xác nhận.`,
        confirmLabel: 'Xuất Output 2',
      })
      setPayrollLoading(false)
      if (!confirmed) return
    }
    if (includeSavedData) {
      setPayrollLoading(true)
      try {
        // Check the exact current employee list before exporting. New codes
        // without a bank account must be confirmed in a modal first.
        const preview = await axios.get<{ employees: PayrollEmployee[] }>(`${API_BASE}/payroll/employees`, {
          params: { session_id: data.session_id },
        })
        const missing = preview.data.employees.filter(
          (employee) => Number(employee.total_hours || 0) > 0 && !String(employee.bank_account || '').trim(),
        )
        if (missing.length) {
          setOutput2BankMissing(missing)
          setOutput2BankAccounts(Object.fromEntries(missing.map((employee) => [employee.employee_code, ''])))
          setPayrollLoading(false)
          setOutput2ChoiceOpen(false)
          return
        }
      } catch (err) {
        setError(readAxiosError(err, 'Không kiểm tra được tài khoản ngân hàng trước khi xuất Output 2'))
        setPayrollLoading(false)
        return
      }
      setPayrollLoading(false)
    }
    setOutput2ChoiceOpen(false)
    await exportOutput2File(includeSavedData)
  }

  async function confirmOutput2BankAccounts() {
    if (!data || !output2BankMissing.length) return
    const accounts = output2BankMissing.map((employee) => ({
      employee_code: employee.employee_code,
      name: employee.name || '',
      account_number: (output2BankAccounts[employee.employee_code] || '').replace(/\D/g, ''),
    }))
    const unresolved = accounts.filter((row) => !/^\d{8,20}$/.test(row.account_number))
    if (unresolved.length) {
      setError(`Còn ${unresolved.length} mã thiếu số tài khoản. Hãy nhập đủ 8–20 chữ số hoặc chọn “Xuất bản hiện tại”.`)
      return
    }
    setPayrollLoading(true)
    setError(null)
    try {
      const confirmed = accounts.filter((row) => /^\d{8,20}$/.test(row.account_number))
      if (confirmed.length) {
        await axios.post(`${API_BASE}/bank/accounts`, {
          factory: data.factory ?? factoryMode,
          accounts: confirmed,
        })
        try {
          await axios.post(`${API_BASE}/bank/backup-drive`, null, {
            params: { factory: data.factory ?? factoryMode },
          })
        } catch {
          // Local registry is saved even when Drive is not configured.
        }
      }
      setOutput2BankMissing([])
      setOutput2BankAccounts({})
      setPayrollLoading(false)
      await exportOutput2File(true)
    } catch (err) {
      setPayrollLoading(false)
      setError(readAxiosError(err, 'Không lưu được số tài khoản ngân hàng'))
    }
  }

  async function exportOutput2WithMissingBankAccounts() {
    setOutput2BankMissing([])
    setOutput2BankAccounts({})
    await exportOutput2File(true)
  }

  async function saveCurrentToHistory() {
    if (!data) return
    if (pendingReviewCount > 0) {
      setError(null)
      setMessage(
        `Bạn cần xác nhận ${pendingReviewCount} dòng ở ${currentReviewTableName} trước khi lưu vào lịch sử.`,
      )
      return
    }

    setHistoryLoading(true)
    setError(null)
    setMessage(null)
    try {
      const selectedMonth = parseOptionalNumber(periodMonth)
      const selectedYear = parseOptionalNumber(periodYear)
      if (!selectedMonth || !selectedYear) return

      // A month is one logical machine copy.  Older versions allowed several
      // local history rows for the same month, so ask once and remove those
      // rows before writing the new copy instead of silently creating another
      // duplicate that later makes month selection ambiguous.
      const existingResponse = await axios.get<{ periods: HistoryPeriod[] }>(`${API_BASE}/history/periods`, {
        params: { month: selectedMonth, year: selectedYear, factory: factoryMode },
      })
      const existingPeriods = existingResponse.data.periods
      if (existingPeriods.length) {
        const label = `tháng ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`
        const shouldReplace = await askForConfirmation({
          kicker: 'BẢN MÁY TRÙNG THÁNG',
          title: `Đã có bản máy ${label}`,
          message:
            `Máy đang có ${existingPeriods.length} bản của ${label}.\n\n` +
            'Bạn có muốn bỏ bản cũ và lưu bản đang làm này không? Chỉ bản mới sẽ còn được dùng khi chọn tháng.',
          confirmLabel: 'Bỏ bản cũ và lưu bản này',
          tone: 'danger',
        })
        if (!shouldReplace) return
        await Promise.all(
          existingPeriods.map((period) =>
            axios.delete(`${API_BASE}/history/periods/${encodeURIComponent(period.id)}`, {
              params: { delete_cloud: false },
            }),
          ),
        )
      }
      const response = await axios.post<HistoryDetail>(`${API_BASE}/history/save`, {
        session_id: data.session_id,
        month: selectedMonth,
        year: selectedYear,
        review_overrides: buildReviewOverrides(payrollReviewItems),
      })
      setHistoryDetail(response.data)
      setSelectedPeriodId(response.data.period.id)
      setSelectedFinalCopyId('')
      setHistorySelectedCode(response.data.employees[0]?.employee_code ?? '')
      setActiveView('history')
      await loadEmployeeRegistry()
      if (data) await refreshPayroll(data.session_id, false)
      setKnownHistoryCodes(await fetchKnownHistoryCodes())
      await loadHistoryPeriods()
      setMessage(`Đã lưu lịch sử ${response.data.period.label}`)
    } catch (err) {
      setError(readAxiosError(err, 'Không lưu được lịch sử'))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function loadHistoryPeriods(filters = historyFilters, factory = factoryMode) {
    setHistoryLoading(true)
    try {
      const response = await axios.get<{ periods: HistoryPeriod[] }>(`${API_BASE}/history/periods`, {
        params: cleanParams({ ...filters, factory }),
      })
      const finalResponse = await axios.get<{ final_copies: HistoryFinalCopy[] }>(`${API_BASE}/history/final-copies`, {
        params: cleanParams({ month: filters.month, year: filters.year, factory }),
      })
      if (factoryModeRef.current !== factory) return
      setHistoryPeriods(response.data.periods)
      setHistoryFinalCopies(finalResponse.data.final_copies)
    } catch (err) {
      if (factoryModeRef.current === factory) setError(readAxiosError(err, 'Không đọc được lịch sử'))
    } finally {
      if (factoryModeRef.current === factory) setHistoryLoading(false)
    }
  }

  async function loadAttendanceOverview(year = attendanceOverviewYear, factory = factoryMode) {
    setHistoryLoading(true)
    try {
      const response = await axios.get<AttendanceOverview>(`${API_BASE}/history/attendance-overview`, {
        params: cleanParams({ year, factory }),
      })
      if (factoryModeRef.current !== factory) return
      setAttendanceOverview(response.data)
      setAttendanceOverviewYear(response.data.year ? String(response.data.year) : '')
      setEmployeeListYear((current) => current || (response.data.year ? String(response.data.year) : ''))
      setEmployeeListMonth((current) => current || (response.data.latest_month ? String(response.data.latest_month) : ''))
      setAttendanceOverviewCode((current) => {
        if (current && response.data.employees.some((employee) => employee.employee_code === current)) {
          return current
        }
        return response.data.employees[0]?.employee_code ?? ''
      })
    } catch (err) {
      if (factoryModeRef.current === factory) setError(readAxiosError(err, 'Không đọc được chuyên cần'))
    } finally {
      if (factoryModeRef.current === factory) setHistoryLoading(false)
    }
  }

  async function loadCloudConfig() {
    try {
      const response = await axios.get<CloudConfig>(`${API_BASE}/cloud/config`)
      setCloudConfig(response.data)
      setCloudForm((current) => ({
        enabled: response.data.enabled,
        supabase_url: response.data.supabase_url,
        service_role_key: current.service_role_key,
        sync_on_save: response.data.sync_on_save,
        drive_backup_enabled: response.data.drive_backup_enabled,
        drive_backup_dir: response.data.drive_backup_dir,
        local_export_dir: response.data.local_export_dir,
        backup_on_history_change: response.data.backup_on_history_change,
      }))
    } catch (err) {
      setError(readAxiosError(err, 'Khong doc duoc cau hinh cloud'))
    }
  }

  async function loadOwnerSubmissions() {
    if (!isOwner) return
    setCloudLoading(true)
    try {
      const response = await axios.get<{ submissions: CloudSubmission[] }>(`${API_BASE}/cloud/submissions`, {
        params: { factory: factoryMode },
      })
      setCloudSubmissions(response.data.submissions)
    } catch (err) {
      setError(readAxiosError(err, 'Không đọc được hòm thư'))
    } finally {
      setCloudLoading(false)
    }
  }

  async function processOwnerSubmission(periodId: string) {
    setCloudLoading(true)
    setError(null)
    setMessage(null)
    try {
      const [latestInfo, knownCodes] = await Promise.all([
        fetchLatestHistoryInfo(),
        fetchKnownHistoryCodes(),
      ])
      const response = await axios.post<AnalyzeResponse>(`${API_BASE}/cloud/submissions/${periodId}/process`)
      const responseData = response.data
      setLatestHistoryInfo(latestInfo)
      setKnownHistoryCodes(knownCodes)
      const memory = await fetchReviewMemory(responseData.period)
      const reviewItems = buildPayrollReviewItems(responseData, latestInfo, knownCodes, memory)
      setReviewMemory(memory)
      setData(responseData)
      setWorkspaceCalculationVersion(ATTENDANCE_CALCULATION_VERSION)
      setPayrollReviewItems(reviewItems)
      const analyzedFactory = responseData.factory ?? 'factory1'
      factoryModeRef.current = analyzedFactory
      setFactoryMode(analyzedFactory)
      setPeriodMonth(responseData.period?.month ? String(responseData.period.month) : '')
      setPeriodYear(responseData.period?.year ? String(responseData.period.year) : '')
      setEmployeeListMonth(responseData.period?.month ? String(responseData.period.month) : '')
      setEmployeeListYear(responseData.period?.year ? String(responseData.period.year) : '')
      await refreshPayroll(responseData.session_id)
      setActiveView('payroll')
      setMessage('Đã nạp hồ sơ từ hòm thư. Bạn có thể xử lý lương/thưởng/phạt rồi xuất Output 2.')
    } catch (err) {
      setError(readAxiosError(err, 'Không xử lý được hồ sơ hòm thư'))
    } finally {
      setCloudLoading(false)
    }
  }

  async function saveCloudConfig() {
    setCloudLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.post<CloudConfig>(`${API_BASE}/cloud/config`, cloudForm)
      setCloudConfig(response.data)
      setCloudForm((current) => ({ ...current, service_role_key: '' }))
      setMessage('Da luu cau hinh Supabase')
    } catch (err) {
      setError(readAxiosError(err, 'Khong luu duoc cau hinh cloud'))
    } finally {
      setCloudLoading(false)
    }
  }

  async function testCloudConfig() {
    setCloudLoading(true)
    setError(null)
    setMessage(null)
    try {
      const saved = await axios.post<CloudConfig>(`${API_BASE}/cloud/config`, cloudForm)
      setCloudConfig(saved.data)
      setCloudForm((current) => ({ ...current, service_role_key: '' }))
      const response = await axios.post<CloudConfig>(`${API_BASE}/cloud/test`)
      setCloudConfig(response.data)
      setMessage('Ket noi Supabase thanh cong')
    } catch (err) {
      setError(readAxiosError(err, 'Ket noi Supabase that bai'))
    } finally {
      setCloudLoading(false)
    }
  }

  async function syncAllCloud() {
    setCloudLoading(true)
    setError(null)
    setMessage(null)
    try {
      await axios.post(`${API_BASE}/cloud/sync-all`)
      await loadCloudConfig()
      setMessage('Da dong bo toan bo lich su local len Supabase')
    } catch (err) {
      setError(readAxiosError(err, 'Dong bo cloud that bai'))
    } finally {
      setCloudLoading(false)
    }
  }

  async function createDriveBackup() {
    setCloudLoading(true)
    setError(null)
    setMessage(null)
    try {
      await axios.post<CloudConfig>(`${API_BASE}/cloud/config`, cloudForm)
      const response = await axios.post<{ path: string; size_bytes: number }>(`${API_BASE}/cloud/backup`)
      await loadCloudConfig()
      setMessage(`Da tao backup: ${response.data.path}`)
    } catch (err) {
      setError(readAxiosError(err, 'Tao backup Drive that bai'))
    } finally {
      setCloudLoading(false)
    }
  }

  async function openDriveFolder(kind: 'root' | 'excel' | 'zip' | 'last') {
    setCloudLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.post<{ path: string }>(`${API_BASE}/cloud/open-folder`, { kind })
      setMessage(`Đã mở thư mục: ${response.data.path}`)
    } catch (err) {
      setError(readAxiosError(err, 'Không mở được thư mục Drive'))
    } finally {
      setCloudLoading(false)
    }
  }

  async function backupAllExcelFiles() {
    setCloudLoading(true)
    setError(null)
    setMessage(null)
    try {
      await axios.post<CloudConfig>(`${API_BASE}/cloud/config`, cloudForm)
      await axios.post(`${API_BASE}/cloud/backup-excel-all`)
      await loadCloudConfig()
      setMessage('Da tao thu muc Excel de doc cho toan bo lich su')
    } catch (err) {
      setError(readAxiosError(err, 'Tao backup Excel that bai'))
    } finally {
      setCloudLoading(false)
    }
  }

  async function requestSaveFinalCopy() {
    if (!finalCopyFile || !finalCopyMonth || !finalCopyYear) return

    setError(null)
    setMessage(null)
    setFinalCopyConflictChecking(true)
    try {
      const response = await axios.get<{ final_copies: HistoryFinalCopy[] }>(`${API_BASE}/history/final-copies`, {
        params: { month: Number(finalCopyMonth), year: Number(finalCopyYear), factory: factoryMode },
      })
      const existing = response.data.final_copies[0]
      if (existing) {
        const shouldReplace = await askForConfirmation({
          kicker: 'BẢN CHỐT CUỐI CÙNG',
          title: `Đã có bản chốt tháng ${finalCopyMonth.padStart(2, '0')}/${finalCopyYear}`,
          message:
            `Bản hiện tại: ${existing.filename}\n\n` +
            'Nếu tiếp tục, file mới sẽ thay thế bản này và được dùng làm bản chốt mới nhất.',
          confirmLabel: 'Thay thế bản cũ',
        })
        if (!shouldReplace) return
      }
      setFinalCopyConflictChecking(false)
      await saveFinalCopy(Boolean(existing))
    } catch (err) {
      setError(readAxiosError(err, 'Không kiểm tra được bản chốt trùng tháng'))
    } finally {
      setFinalCopyConflictChecking(false)
    }
  }

  async function saveFinalCopy(replaceExisting: boolean) {
    if (!finalCopyFile || !finalCopyMonth || !finalCopyYear) return

    setCloudLoading(true)
    setError(null)
    setMessage(null)
    try {
      await axios.post<CloudConfig>(`${API_BASE}/cloud/config`, cloudForm)
      const uploadForm = new FormData()
      uploadForm.append('file', finalCopyFile)
      uploadForm.append('month', finalCopyMonth)
      uploadForm.append('year', finalCopyYear)
      uploadForm.append('factory', factoryMode)
      uploadForm.append('smart_scan', String(smartScanEnabled))
      uploadForm.append('replace_existing', String(replaceExisting))
      const response = await axios.post<{ path: string; folder: string; profile_sync?: ProfileSyncSummary }>(`${API_BASE}/cloud/final-copy`, uploadForm)
      await loadCloudConfig()
      await loadEmployeeRegistry(selectedCode)
      if (data) await refreshPayroll(data.session_id, true)
      await loadHistoryPeriods(historyFilters)
      const bankSync = response.data.profile_sync?.bank_account_sync
      const bankConflictCount = bankSync?.conflict_count ?? 0
      const bankWarning = bankConflictCount
        ? ` Cảnh báo: ${bankConflictCount} mã có số tài khoản không khớp/trùng; app không ghi đè. Vào Ngân hàng để kiểm tra và chọn lại.`
        : ''
      setMessage(`Đã lưu bản sao cuối cùng và cập nhật thông tin nhân viên theo bản mới nhất: ${response.data.path}${bankWarning}`)
    } catch (err) {
      setError(readAxiosError(err, 'Không lưu được bản sao cuối cùng'))
    } finally {
      setCloudLoading(false)
    }
  }

  async function selectFinalCopyFile(selectedFile: File | null) {
    await inspectFinalCopyFile(selectedFile)
  }

  async function inspectFinalCopyFile(selectedFile: File | null): Promise<boolean> {
    setFinalCopyFile(null)
    setFinalCopyMonth('')
    setFinalCopyYear('')
    setError(null)
    setMessage(null)
    if (!selectedFile) return false
    const lowerName = selectedFile.name.toLowerCase()
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xlsm')) {
      setError(`File "${selectedFile.name}" không đúng định dạng. Chỉ nhận .xlsx hoặc .xlsm.`)
      return false
    }

    setFinalCopyInspecting(true)
    try {
      const uploadForm = new FormData()
      uploadForm.append('file', selectedFile)
      uploadForm.append('factory', factoryMode)
      uploadForm.append('smart_scan', String(smartScanEnabled))
      const response = await axios.post<PeriodInfo & FileInspection>(`${API_BASE}/cloud/final-copy/period`, uploadForm)
      setFinalCopyFile(selectedFile)
      setFinalCopyMonth(response.data.month ? String(response.data.month) : '')
      setFinalCopyYear(response.data.year ? String(response.data.year) : '')
      setMessage(`Đã nhận diện đúng bản sao cuối cùng · ${response.data.employee_count} mã · kỳ ${response.data.period_label}.`)
      return true
    } catch (err) {
      setError(readAxiosError(err, 'Không đọc được tháng/năm từ file chốt'))
      return false
    } finally {
      setFinalCopyInspecting(false)
    }
  }

  async function saveCurrentAnalysisCopy() {
    if (!data?.session_id || !periodMonth || !periodYear) return

    setCloudLoading(true)
    setError(null)
    setMessage(null)
    try {
      await axios.post<CloudConfig>(`${API_BASE}/cloud/config`, cloudForm)
      const selectedMonth = Number(periodMonth)
      const selectedYear = Number(periodYear)
      const existingResponse = await axios.get<{ copies: Array<{ filename: string; modified_at?: string }> }>(`${API_BASE}/cloud/session-copy/existing`, {
        params: { month: selectedMonth, year: selectedYear, factory: factoryMode },
      })
      const existingCopies = existingResponse.data.copies ?? []
      let replaceExisting = false
      if (existingCopies.length) {
        const label = `tháng ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`
        const shouldReplace = await askForConfirmation({
          kicker: 'BẢN MÁY DRIVE TRÙNG THÁNG',
          title: `Đã có bản máy ${label} trên Drive`,
          message:
            `Đang có ${existingCopies.length} file bản máy của ${label}.\n\n` +
            'Bạn có muốn bỏ các file cũ và lưu bản đang làm này không?',
          confirmLabel: 'Bỏ bản cũ và lưu bản này',
          tone: 'danger',
        })
        if (!shouldReplace) return
        replaceExisting = true
      }
      const response = await axios.post<{ path: string; folder: string; final_folder: string; profile_sync?: ProfileSyncSummary; replaced_paths?: string[] }>(`${API_BASE}/cloud/session-copy`, {
        session_id: data.session_id,
        month: selectedMonth,
        year: selectedYear,
        replace_existing: replaceExisting,
      })
      await loadCloudConfig()
      await loadEmployeeRegistry(selectedCode)
      await loadHistoryPeriods(historyFilters)
      setMessage(`Đã lưu bản đang phân tích vào Drive${replaceExisting ? ' và thay thế bản trùng tháng' : ''}: ${response.data.path}`)
    } catch (err) {
      setError(readAxiosError(err, 'Không lưu được bản đang phân tích'))
    } finally {
      setCloudLoading(false)
    }
  }

  async function submitToOwner() {
    if (!data) return
    if (pendingReviewCount > 0) {
      setError(null)
      setMessage(`Bạn cần xác nhận ${pendingReviewCount} dòng ở ${currentReviewTableName} trước khi gửi cho chủ.`)
      return
    }

    setSubmitLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.post<{ period_id: string; employees: number; daily_rows: number }>(
        `${API_BASE}/attendance/submit-to-owner`,
        {
          session_id: data.session_id,
          review_overrides: buildReviewOverrides(payrollReviewItems),
        },
      )
      setMessage(`Đã gửi cho chủ: ${response.data.employees} nhân viên, ${response.data.daily_rows} dòng công.`)
    } catch (err) {
      setError(readAxiosError(err, 'Không gửi được cho chủ'))
    } finally {
      setSubmitLoading(false)
    }
  }

  function changeEmployeeListYear(year: string) {
    setEmployeeListYear(year)
    if (year) {
      void loadAttendanceOverview(year)
    }
  }

  async function selectHistoryPeriod(periodId: string) {
    setSelectedFinalCopyId('')
    await loadHistoryDetail(periodId)
  }

  function selectHistoryFinalCopy(copyId: string) {
    setSelectedFinalCopyId(copyId)
    setSelectedPeriodId('')
    setHistoryDetail(null)
    setHistorySelectedCode('')
    setHistorySearchResults([])
  }

  async function loadHistoryDetail(periodId: string, employeeCode?: string) {
    setSelectedPeriodId(periodId)
    setSelectedFinalCopyId('')
    setHistoryLoading(true)
    setError(null)
    try {
      const response = await axios.get<HistoryDetail>(`${API_BASE}/history/periods/${periodId}`)
      setHistoryDetail(response.data)
      const nextCode = employeeCode || response.data.employees[0]?.employee_code || ''
      setHistorySelectedCode(nextCode)
    } catch (err) {
      setError(readAxiosError(err, 'Không đọc được chi tiết kỳ chấm công'))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function searchEmployeeHistory() {
    if (!historyFilters.employee_code.trim()) {
      setHistorySearchResults([])
      await loadHistoryPeriods()
      return
    }

    setHistoryLoading(true)
    setError(null)
    try {
      const response = await axios.get<{ results: HistorySearchResult[] }>(`${API_BASE}/history/search`, {
        params: cleanParams({ ...historyFilters, factory: factoryMode }),
      })
      setHistorySearchResults(response.data.results)
      await loadHistoryPeriods(historyFilters)
      const firstResult = response.data.results[0]
      if (firstResult) {
        await loadHistoryDetail(firstResult.period_id, firstResult.employee_code)
      }
    } catch (err) {
      setError(readAxiosError(err, 'Không tìm được lịch sử nhân viên'))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function selectHistorySearchResult(result: HistorySearchResult) {
    await loadHistoryDetail(result.period_id, result.employee_code)
  }

  async function saveHistoryEmployee(periodId: string, employeeCode: string, draft: HistoryEmployeeDraft) {
    setHistoryLoading(true)
    setError(null)
    setMessage(null)
    const employee = historyDetail?.employees.find((item) => item.employee_code === employeeCode)
    const calculated = calculateHistoryOutput2(draft, employee)
    try {
      const response = await axios.patch<HistoryDetail>(
        `${API_BASE}/history/periods/${periodId}/employees/${employeeCode}`,
        {
          employee_name: draft.employee_name,
          total_hours: calculated.totalHours,
          work_days: calculated.workDays,
          monthly_salary: calculated.monthlySalary,
          daily_salary: calculated.dailySalary,
          hourly_salary: calculated.hourlySalary,
          standard_work_days: 26,
          bonus: parseNumber(draft.bonus, 0),
          advance_or_penalty: parseNumber(draft.advance_or_penalty, 0),
          final_salary: calculated.finalSalary,
          note: draft.note,
          daily_records: draft.daily_records.map((row) => ({
            day: row.day,
            work_value: parseReviewValue(row.work_value),
            missing_count: parseReviewValue(row.missing_count),
            late_minutes: row.late_minutes.trim() ? parseNumber(row.late_minutes, 0) : null,
            review_notes: row.note.trim() ? [row.note.trim()] : [],
          })),
        },
      )
      setHistoryDetail(response.data)
      setHistorySelectedCode(employeeCode)
      setHistorySearchResults((items) =>
        items.map((item) =>
          item.period_id === periodId && item.employee_code === employeeCode
            ? {
                ...item,
                employee_name: draft.employee_name,
                total_hours: calculated.totalHours,
                work_days: calculated.workDays,
                final_salary: calculated.finalSalary,
                note: draft.note,
              }
            : item,
        ),
      )
      await loadHistoryPeriods(historyFilters)
      await loadAttendanceOverview(attendanceOverviewYear)
      setMessage(`Đã lưu thay đổi cho mã ${employeeCode}`)
    } catch (err) {
      setError(readAxiosError(err, 'Không lưu được thay đổi lịch sử'))
      throw err
    } finally {
      setHistoryLoading(false)
    }
  }

  async function deleteHistoryPeriod(periodId: string) {
    const period = historyPeriods.find((item) => item.id === periodId)
    if (!period) return
    const label = `Tháng ${period.month.toString().padStart(2, '0')}/${period.year}`
    if (!(await askForConfirmation({
      kicker: 'XÓA BẢN MÁY',
      title: `Xóa bản chấm máy của ${label}?`,
      message: 'Bản chốt cuối cùng của tháng này sẽ được giữ nguyên.',
      confirmLabel: 'Xóa bản máy',
      tone: 'danger',
    }))) return

    const deleteCloud = Boolean(
      cloudConfig?.enabled &&
        cloudConfig.configured &&
        await askForConfirmation({
          kicker: 'XÓA DỮ LIỆU ĐỒNG BỘ',
          title: 'Xóa thêm bản máy trên Supabase?',
          message: 'Nếu chọn xóa, bản chấm máy sẽ bị xóa trên Supabase và local. Nếu hủy, chỉ xóa local và bản máy Drive.',
          confirmLabel: 'Xóa cả Supabase',
          tone: 'danger',
        }),
    )
    setHistoryLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.delete<{ status: 'ok' | 'partial'; drive?: { status?: string } }>(
        `${API_BASE}/history/periods/${periodId}`,
        { params: { delete_cloud: deleteCloud } },
      )
      if (selectedPeriodId === periodId) {
        setSelectedPeriodId('')
        setHistoryDetail(null)
        setHistorySelectedCode('')
        setHistorySearchResults([])
      }
      await loadHistoryPeriods()
      if (response.data.status === 'partial' || response.data.drive?.status === 'partial') {
        setMessage(`Đã xóa bản máy local${deleteCloud ? ' và Supabase' : ''}, nhưng Drive chưa xóa hoàn toàn — ${label}`)
      } else {
        setMessage(`Đã xóa bản chấm máy${deleteCloud ? ' trên Supabase và local' : ' local và Drive'} — ${label}`)
      }
    } catch (err) {
      setError(readAxiosError(err, 'Không xóa được bản chấm máy'))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function deleteHistoryFinalCopy(copyId: string) {
    const finalCopy = historyFinalCopies.find((item) => item.id === copyId)
    if (!finalCopy) return
    const label = `Tháng ${finalCopy.month.toString().padStart(2, '0')}/${finalCopy.year}`
    if (!(await askForConfirmation({
      kicker: 'XÓA BẢN CHỐT',
      title: `Xóa bản chốt cuối của ${label}?`,
      message: 'Bản máy của tháng này sẽ được giữ nguyên.',
      confirmLabel: 'Xóa bản chốt',
      tone: 'danger',
    }))) return

    setHistoryLoading(true)
    setError(null)
    setMessage(null)
    try {
      await axios.delete(`${API_BASE}/history/final-copies/${encodeURIComponent(copyId)}`)
      if (selectedFinalCopyId === copyId) {
        setSelectedFinalCopyId('')
      }
      await loadHistoryPeriods()
      setMessage(`Đã xóa bản chốt cuối, bản máy vẫn được giữ nguyên — ${label}`)
    } catch (err) {
      setError(readAxiosError(err, 'Không xóa được bản chốt cuối'))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function deleteHistoryMonth(month: number, year: number) {
    const label = `Tháng ${month.toString().padStart(2, '0')}/${year}`
    const matchingPeriods = historyPeriods.filter((item) => item.month === month && item.year === year)
    const matchingFinalCopies = historyFinalCopies.filter((item) => item.month === month && item.year === year)
    if (!(await askForConfirmation({
      kicker: 'XÓA CẢ THÁNG',
      title: `Xóa toàn bộ ${label}?`,
      message: `Thao tác này sẽ xóa ${matchingPeriods.length} bản chấm máy trên máy và ${matchingFinalCopies.length ? 'bản sao cuối cùng cùng toàn bộ thư mục tháng trên Drive' : 'thư mục tháng tương ứng trên Drive'}.`,
      confirmLabel: 'Xóa cả tháng',
      tone: 'danger',
    }))) {
      return
    }
    const deleteCloud = Boolean(
      cloudConfig?.enabled &&
        cloudConfig.configured &&
        await askForConfirmation({
          kicker: 'XÓA DỮ LIỆU ĐỒNG BỘ',
          title: 'Xóa thêm dữ liệu tháng này trên Supabase?',
          message: 'Nếu chọn xóa, dữ liệu tháng này sẽ bị xóa trên Supabase, local và Drive. Nếu hủy, Supabase vẫn được giữ lại.',
          confirmLabel: 'Xóa cả Supabase',
          tone: 'danger',
        }),
    )

    setHistoryLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.delete<{
        status: 'ok' | 'partial'
        drive?: { status?: string; errors?: Array<{ error?: string }> }
      }>(`${API_BASE}/history/months/${year}/${month}`, {
        params: {
          factory: factoryMode,
          delete_cloud: deleteCloud,
        },
      })
      const selectedPeriod = historyPeriods.find((item) => item.id === selectedPeriodId)
      const selectedFinalCopy = historyFinalCopies.find((item) => item.id === selectedFinalCopyId)
      if (
        (selectedPeriod?.month === month && selectedPeriod.year === year) ||
        (selectedFinalCopy?.month === month && selectedFinalCopy.year === year)
      ) {
        setSelectedPeriodId('')
        setSelectedFinalCopyId('')
        setHistoryDetail(null)
        setHistorySelectedCode('')
        setHistorySearchResults([])
      }
      await loadHistoryPeriods()
      const driveUnavailable = response.data.status === 'partial' || response.data.drive?.status === 'partial'
      if (driveUnavailable) {
        setMessage(`Đã xóa lịch sử local${deleteCloud ? ' và Supabase' : ''} — chưa xóa được bản sao/thư mục Drive; hãy đồng bộ Drive rồi thử lại — ${label}`)
        return
      }
      setMessage(
        `${deleteCloud ? 'Đã xóa trên Supabase, local và Drive' : cloudConfig?.enabled && cloudConfig.configured ? 'Đã xóa trên local và Drive; Supabase vẫn giữ' : 'Đã xóa trên local và Drive'} — ${label}`,
      )
    } catch (err) {
      setError(readAxiosError(err, 'Không xóa được dữ liệu tháng'))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function downloadHistoryOutput(periodId: string, kind: 'output1' | 'output2') {
    const period = historyPeriods.find((item) => item.id === periodId) ?? historyDetail?.period
    setHistoryLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.get(`${API_BASE}/history/periods/${periodId}/download/${kind}`, {
        responseType: 'blob',
      })
      downloadBlob(
        response.data,
        readablePeriodExportFilename(
          period?.factory ?? factoryMode,
          period,
          kind === 'output1' ? 'Output1' : 'Output2',
          'xlsx',
        ),
      )
      setMessage(`Đã xuất ${kind === 'output1' ? 'Output 1' : 'Output 2'} cho ${period?.label ?? 'kỳ đã chọn'}`)
    } catch (err) {
      setError(readAxiosError(err, `Không xuất được ${kind === 'output1' ? 'Output 1' : 'Output 2'} từ lịch sử`))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function downloadHistoryEmployeeImages(periodId: string, kind: 'output1' | 'output2' = 'output1') {
    const period = historyPeriods.find((item) => item.id === periodId) ?? historyDetail?.period
    setHistoryLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.get(`${API_BASE}/history/periods/${periodId}/employee-images/${kind}`, {
        responseType: 'blob',
      })
      downloadBlob(
        response.data,
        readablePeriodExportFilename(
          period?.factory ?? factoryMode,
          period,
          kind === 'output1' ? 'AnhBangCongNhanVien' : 'AnhBangLuongNhanVien',
          'zip',
        ),
      )
      setMessage(`Đã chụp ảnh bảng công từ Excel cho ${period?.label ?? 'kỳ đã chọn'}`)
    } catch (err) {
      setError(readAxiosError(err, 'Không xuất được ảnh bảng công từ lịch sử'))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function downloadFinalCopyOutput(copyId: string, kind: 'output1' | 'output2') {
    const finalCopy = historyFinalCopies.find((item) => item.id === copyId)
    setHistoryLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.get(`${API_BASE}/history/final-copies/${copyId}/download/${kind}`, {
        responseType: 'blob',
      })
      downloadBlob(
        response.data,
        readablePeriodExportFilename(
          finalCopy?.factory ?? factoryMode,
          finalCopy,
          kind === 'output1' ? 'Output1' : 'Output2',
          'xlsx',
        ),
      )
      setMessage(`Đã xuất ${kind === 'output1' ? 'Output 1' : 'Output 2'} từ bản sao cuối cùng ${finalCopy?.label ?? ''}`.trim())
    } catch (err) {
      setError(readAxiosError(err, `Không xuất được ${kind === 'output1' ? 'Output 1' : 'Output 2'} từ bản sao cuối cùng`))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function downloadFinalCopyEmployeeImages(copyId: string, kind: 'output1' | 'output2' = 'output2') {
    const finalCopy = historyFinalCopies.find((item) => item.id === copyId)
    setHistoryLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.get(`${API_BASE}/history/final-copies/${copyId}/employee-images/${kind}`, {
        responseType: 'blob',
      })
      downloadBlob(
        response.data,
        readablePeriodExportFilename(
          finalCopy?.factory ?? factoryMode,
          finalCopy,
          kind === 'output1' ? 'AnhBangCongNhanVien_BanChot' : 'AnhBangLuongNhanVien_BanChot',
          'zip',
        ),
      )
      setMessage(`Đã chụp ảnh bảng công từ bản sao cuối cùng ${finalCopy?.label ?? ''}`.trim())
    } catch (err) {
      setError(readAxiosError(err, 'Không xuất được ảnh bảng công từ bản sao cuối cùng'))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function exportOutput1() {
    if (!data) return
    if (
      pendingReviewCount > 0 &&
      !(await askForConfirmation({
        kicker: 'KIỂM TRA TRƯỚC KHI XUẤT',
        title: 'Vẫn xuất Output 1?',
        message: `Còn ${pendingReviewCount} mục đi trễ/quên bấm/chưa rõ chưa được xác nhận.`,
        confirmLabel: 'Xuất Output 1',
      }))
    ) {
      return
    }

    setOutput1Loading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.post(
        `${API_BASE}/attendance/export`,
        {
          session_id: data.session_id,
          review_overrides: buildReviewOverrides(payrollReviewItems),
        },
        {
          responseType: 'blob',
        },
      )
      downloadBlob(
        response.data,
        readablePeriodExportFilename(data.factory ?? factoryMode, data.period, 'Output1', 'xlsx'),
      )
      setMessage(
        data.missing_output1_summary
          ? 'Đã xuất Output 1 và bổ sung 4 cột theo khung mới: Tổng giờ công, Mức phạt NQ/giờ, Mã, Tên nhân viên / Ghi chú.'
          : 'Đã xuất Output 1',
      )
    } catch (err) {
      setError(readAxiosError(err, 'Không xuất được Output 1'))
    } finally {
      setOutput1Loading(false)
    }
  }

  async function exportEmployeeCards(kind: 'output1' | 'output2') {
    if (!data) return
    if (
      pendingReviewCount > 0 &&
      !(await askForConfirmation({
        kicker: 'KIỂM TRA TRƯỚC KHI XUẤT',
        title: 'Vẫn xuất ảnh bảng công nhân viên?',
        message: `Còn ${pendingReviewCount} mục đi trễ/quên bấm/chưa rõ chưa được xác nhận.`,
        confirmLabel: 'Xuất ảnh',
      }))
    ) {
      return
    }

    setCardExportLoading(kind)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.post<{ download_url: string; filename: string }>(
        `${API_BASE}/attendance/prepare-employee-cards`,
        {
          session_id: data.session_id,
          kind,
          review_overrides: buildReviewOverrides(payrollReviewItems),
        },
      )
      const downloadUrl = `${API_BASE}${response.data.download_url}`
      downloadFromUrl(
        ROLE_LOGIN_ENABLED ? withDownloadToken(downloadUrl, auth?.access_token ?? '') : downloadUrl,
        readablePeriodExportFilename(
          data.factory ?? factoryMode,
          data.period,
          kind === 'output1' ? 'PhieuNhanVien_BangChamCong' : 'PhieuNhanVien_BangLuong',
          'zip',
        ),
      )
      setMessage(`Đã xuất ảnh bảng công nhân viên ${kind === 'output1' ? 'Output 1' : 'Output 2'}`)
    } catch (err) {
      setError(readAxiosError(err, 'Không xuất được ảnh bảng công nhân viên'))
    } finally {
      setCardExportLoading(null)
    }
  }

  async function chooseEmployeeCardSource(source: EmployeeCardSource) {
    setError(null)
    if (source === 'current') {
      if (!data) {
        setError('Chưa có bản chấm máy đang mở để xuất ảnh.')
        return
      }
      setEmployeeCardSource({ source, label: `Bản đang chấm ${data.period.label || ''}`.trim() })
      setEmployeeCardChoiceOpen(false)
      setEmployeeCardKindChoiceOpen(true)
      return
    }
    await openEmployeeCardArchive(source)
  }

  async function openEmployeeCardArchive(source: 'history' | 'final_copy') {
    setError(null)
    setEmployeeCardArchiveKind(source)
    setEmployeeCardArchiveItems([])
    setEmployeeCardArchiveSelectedId('')
    setEmployeeCardChoiceOpen(false)
    setEmployeeCardKindChoiceOpen(false)
    setEmployeeCardArchiveChoiceOpen(true)
    setHistoryLoading(true)
    try {
      const rawItems: Array<HistoryPeriod | HistoryFinalCopy> = source === 'history'
        ? (await axios.get<{ periods: HistoryPeriod[] }>(`${API_BASE}/history/periods`, { params: { factory: factoryMode } })).data.periods
        : (await axios.get<{ final_copies: HistoryFinalCopy[] }>(`${API_BASE}/history/final-copies`, { params: { factory: factoryMode } })).data.final_copies
      const items = latestSavedSourceByMonth(rawItems)
      if (!items.length) {
        throw new Error(source === 'history' ? 'Chưa có bản chấm máy đã lưu.' : 'Chưa có bản sao lưu cuối cùng.')
      }
      setEmployeeCardArchiveItems(items)
      // The API returns newest-first; this is also enforced by the helper so
      // the first month is always the default without exposing duplicates.
      setEmployeeCardArchiveSelectedId(items[0].id)
    } catch (err) {
      setError(readAxiosError(err, source === 'history' ? 'Chưa có bản chấm máy đã lưu' : 'Chưa có bản sao lưu cuối cùng'))
    } finally {
      setHistoryLoading(false)
    }
  }

  function selectFactory2LegacyFile(selectedFile: File | null) {
    setError(null)
    setMessage(null)
    if (selectedFile && !isExcelFile(selectedFile)) {
      setFactory2LegacyFile(null)
      setError(`File "${selectedFile.name}" không đúng định dạng. Chỉ nhận .xlsx hoặc .xlsm.`)
      return
    }
    setFactory2LegacyFile(selectedFile)
  }

  async function convertFactory2LegacyWorkbook() {
    if (!factory2LegacyFile) return
    setFactory2LegacyLoading(true)
    setError(null)
    setMessage(null)
    try {
      const uploadForm = new FormData()
      uploadForm.append('file', factory2LegacyFile)
      uploadForm.append('output_kind', factory2LegacyOutputKind)
      const response = await axios.post(`${API_BASE}/attendance/factory2/convert-legacy`, uploadForm, { responseType: 'blob' })
      const sourceStem = factory2LegacyFile.name.replace(/\.(xlsx|xlsm)$/i, '')
      const outputLabel = factory2LegacyOutputKind === 'output2' ? 'Output2_KhungMoi' : 'Output1'
      const filename = `Xuong2_${outputLabel}_${sourceStem}.xlsx`
      const convertedFile = new File([response.data], filename, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      downloadBlob(response.data, filename)
      if (factory2LegacyOutputKind === 'output2') {
        const readyToSave = await inspectFinalCopyFile(convertedFile)
        if (!readyToSave) return
      }
      setFactory2LegacyDialogOpen(false)
      setFactory2LegacyFile(null)
      setMessage(
        factory2LegacyOutputKind === 'output2'
          ? 'Đã chuyển sang Output 2 khung mới, giữ dữ liệu lương/thưởng/phạt có trong bảng cũ và đặt sẵn vào mục Bản sao cuối cùng Xưởng 2. Hãy kiểm tra rồi bấm Lưu bản sao cuối cùng.'
          : 'Đã chuyển bảng cũ sang Output 1 Xưởng 2. Các dòng rỗng và nhân viên không có giờ chấm đã được bỏ qua.',
      )
    } catch (err) {
      setError(readAxiosError(err, 'Không chuyển được bảng dọc Xưởng 2'))
    } finally {
      setFactory2LegacyLoading(false)
    }
  }

  function selectFactory1LegacyFile(selectedFile: File | null) {
    setError(null)
    setMessage(null)
    if (selectedFile && !isLegacyExcelFile(selectedFile)) {
      setFactory1LegacyFile(null)
      setError(`File "${selectedFile.name}" không đúng định dạng. Chỉ nhận .xls, .xlsx hoặc .xlsm.`)
      return
    }
    setFactory1LegacyFile(selectedFile)
  }

  async function convertFactory1LegacyWorkbook() {
    if (!factory1LegacyFile) return
    setFactory1LegacyLoading(true)
    setError(null)
    setMessage(null)
    try {
      const uploadForm = new FormData()
      uploadForm.append('file', factory1LegacyFile)
      const response = await axios.post(`${API_BASE}/attendance/factory1/convert-legacy`, uploadForm, { responseType: 'blob' })
      const sourceStem = factory1LegacyFile.name.replace(/\.(xls|xlsx|xlsm)$/i, '')
      const filename = `Xuong1_Output2_KhungMoi_${sourceStem}.xlsx`
      const convertedFile = new File([response.data], filename, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      downloadBlob(response.data, filename)
      const readyToSave = await inspectFinalCopyFile(convertedFile)
      if (!readyToSave) return
      setFactory1LegacyDialogOpen(false)
      setFactory1LegacyFile(null)
      setMessage('Đã chuyển bảng cũ Xưởng 1 sang khung mới có công thức, giữ mã/tên, Bắt đầu làm và ghi chú; dữ liệu ngân hàng không được nhập. File đã đặt sẵn vào Bản sao cuối cùng Xưởng 1 để bạn kiểm tra và lưu.')
    } catch (err) {
      setError(readAxiosError(err, 'Không chuyển được bảng cũ Xưởng 1'))
    } finally {
      setFactory1LegacyLoading(false)
    }
  }

  function confirmEmployeeCardArchive() {
    const selected = employeeCardArchiveItems.find((item) => item.id === employeeCardArchiveSelectedId)
    if (!selected) {
      setError('Hãy chọn một bản đã lưu trước khi tiếp tục.')
      return
    }
    setEmployeeCardSource({
      source: employeeCardArchiveKind,
      id: selected.id,
      label: selected.label,
    })
    setEmployeeCardArchiveChoiceOpen(false)
    setEmployeeCardKindChoiceOpen(true)
  }

  async function exportEmployeeCardsFromSelection(kind: 'output1' | 'output2') {
    const selection = employeeCardSource
    if (!selection) return
    setEmployeeCardKindChoiceOpen(false)
    if (selection.source === 'current') {
      await exportEmployeeCards(kind)
    } else if (selection.source === 'history' && selection.id) {
      await downloadHistoryEmployeeImages(selection.id, kind)
    } else if (selection.source === 'final_copy' && selection.id) {
      await downloadFinalCopyEmployeeImages(selection.id, kind)
    }
  }

  if (authLoading) {
    return <StartupLoadingView />
  }

  if (ROLE_LOGIN_ENABLED && !auth) {
    return (
      <LoginView
        form={loginForm}
        loading={loginLoading}
        error={error}
        onFormChange={setLoginForm}
        onLogin={login}
      />
    )
  }

  return (
    <main className="app-shell" aria-busy={!workspaceHydrated}>
      {!workspaceHydrated && (
        <div className="workspace-restore-backdrop" role="presentation">
          <section
            className="workspace-restore-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-restore-title"
            aria-describedby="workspace-restore-description"
            tabIndex={0}
            autoFocus
            onKeyDown={(event) => event.preventDefault()}
          >
            <div className="workspace-restore-spinner" aria-hidden="true">
              <svg viewBox="0 0 48 48">
                <rect x="8" y="10" width="32" height="29" rx="7" />
                <path d="M15 18h18M15 24h11M15 30h8" />
                <circle cx="34" cy="31" r="7" />
                <path d="m31 31 2 2 4-5" />
              </svg>
              <span />
            </div>
            <div className="workspace-restore-copy">
              <p>Đang mở lại phiên làm việc</p>
              <h2 id="workspace-restore-title">Đang khôi phục phần bạn làm dở</h2>
              <span id="workspace-restore-description">
                App đang tải lại bảng phân tích và các dòng xác nhận chưa hoàn tất. Vui lòng chờ một chút để dữ liệu được mở đầy đủ.
              </span>
            </div>
            <div className="workspace-restore-progress" aria-hidden="true"><i /></div>
          </section>
        </div>
      )}
      {confirmationRequest && <ConfirmationDialog request={confirmationRequest} onResolve={finishConfirmation} />}
      {employeeCardChoiceOpen && (
        <div className="export-choice-backdrop" role="presentation" onMouseDown={() => setEmployeeCardChoiceOpen(false)}>
          <section
            className="export-choice-dialog employee-card-choice-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-card-choice-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="export-choice-kicker">Bước 1 · Chọn nguồn ảnh</p>
            <h2 id="employee-card-choice-title">Bạn muốn cắt ảnh từ bản nào?</h2>
            <p>Sau khi chọn nguồn, app mới hỏi bạn muốn cắt theo khung Output 1 hay Output 2.</p>
            <div className="export-choice-options employee-card-source-options">
              <button type="button" className="export-choice-card" disabled={!data || historyLoading} onClick={() => void chooseEmployeeCardSource('current')}>
                <strong>Bản vừa chấm máy, chưa lưu</strong>
                <span>Dùng đúng phiên đang mở và các chỉnh sửa tạm hiện tại.</span>
              </button>
              <button type="button" className="export-choice-card" disabled={historyLoading} onClick={() => void chooseEmployeeCardSource('history')}>
                <strong>Bản chấm máy đã lưu</strong>
                <span>Dùng dữ liệu lịch sử đã lưu trên máy.</span>
              </button>
              <button type="button" className="export-choice-card formula-only" disabled={historyLoading} onClick={() => void chooseEmployeeCardSource('final_copy')}>
                <strong>Bản sao lưu cuối cùng</strong>
                <span>Dùng bản chốt cuối cùng đã lưu.</span>
              </button>
            </div>
            <button type="button" className="secondary-button export-choice-cancel" onClick={() => setEmployeeCardChoiceOpen(false)}>Hủy</button>
          </section>
        </div>
      )}
      {employeeCardArchiveChoiceOpen && (
        <div className="export-choice-backdrop" role="presentation" onMouseDown={() => setEmployeeCardArchiveChoiceOpen(false)}>
          <section
            className="export-choice-dialog employee-card-choice-dialog employee-card-archive-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-card-archive-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="export-choice-kicker">Bước 1 · Chọn bản đã lưu</p>
            <h2 id="employee-card-archive-title">
              {employeeCardArchiveKind === 'history' ? 'Chọn tháng bản chấm máy' : 'Chọn tháng bản sao lưu cuối cùng'}
            </h2>
            <div className="employee-card-archive-list" role="listbox" aria-label="Danh sách bản đã lưu">
              {historyLoading && <div className="employee-card-archive-loading"><span className="button-spinner" aria-hidden="true" />Đang tải danh sách tháng...</div>}
              {!historyLoading && employeeCardArchiveItems.map((item, index) => {
                const isSelected = item.id === employeeCardArchiveSelectedId
                const savedAt = 'created_at' in item ? item.created_at : item.modified_at
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`employee-card-archive-item${isSelected ? ' is-selected' : ''}`}
                    onClick={() => setEmployeeCardArchiveSelectedId(item.id)}
                  >
                    <span className="employee-card-archive-period">T{item.month}/{item.year}</span>
                    <span className="employee-card-archive-copy">
                      <strong>{item.label}</strong>
                      <small>{savedAt ? `Lưu lúc ${new Date(savedAt).toLocaleString('vi-VN')}` : 'Bản đã lưu'}</small>
                    </span>
                    {index === 0 && <em>Mới nhất</em>}
                    <span className="employee-card-archive-check" aria-hidden="true">{isSelected ? '✓' : ''}</span>
                  </button>
                )
              })}
            </div>
            <div className="employee-card-archive-actions">
              <button type="button" className="secondary-button" onClick={() => { setEmployeeCardArchiveChoiceOpen(false); setEmployeeCardChoiceOpen(true) }}>
                Quay lại chọn nguồn
              </button>
              <button type="button" className="primary-button" disabled={!employeeCardArchiveSelectedId} onClick={confirmEmployeeCardArchive}>
                Dùng bản đã chọn
              </button>
            </div>
          </section>
        </div>
      )}
      {employeeCardKindChoiceOpen && employeeCardSource && (
        <div className="export-choice-backdrop" role="presentation" onMouseDown={() => setEmployeeCardKindChoiceOpen(false)}>
          <section
            className="export-choice-dialog employee-card-choice-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-card-kind-choice-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="export-choice-kicker">Bước 2 · Chọn khung cắt</p>
            <h2 id="employee-card-kind-choice-title">Xuất Output 1 hay Output 2?</h2>
            <div className="employee-card-selected-source">
              <div className="employee-card-month-hint">Tháng xuất</div>
              <span>Nguồn đã chọn</span>
              <button
                type="button"
                onClick={() => {
                  setEmployeeCardKindChoiceOpen(false)
                  if (employeeCardSource.source === 'current') setEmployeeCardChoiceOpen(true)
                  else void openEmployeeCardArchive(employeeCardSource.source)
                }}
                title="Đổi bản đã lưu"
              >
                <strong>{employeeCardSource.label}</strong>
              </button>
            </div>
            <p className="employee-card-month-note">Nếu cần tháng khác, bấm vào ô tháng phía trên để chọn lại bản đã lưu. Output 1 cắt đến thông tin nhân viên; Output 2 lấy toàn bộ khung công và lương.</p>
            <div className="export-choice-options">
              <button type="button" className="export-choice-card" disabled={cardExportLoading !== null || historyLoading} onClick={() => void exportEmployeeCardsFromSelection('output1')}>
                <strong>Xuất ảnh Output 1</strong>
                <span>Cắt phần bảng công đến cột tên nhân viên/ghi chú.</span>
              </button>
              <button type="button" className="export-choice-card formula-only" disabled={cardExportLoading !== null || historyLoading} onClick={() => void exportEmployeeCardsFromSelection('output2')}>
                <strong>Xuất ảnh Output 2</strong>
                <span>Cắt toàn bộ khung mới gồm ngày công, làm thêm và khu vực lương.</span>
              </button>
            </div>
            <button type="button" className="secondary-button export-choice-cancel" onClick={() => { setEmployeeCardKindChoiceOpen(false); setEmployeeCardChoiceOpen(true) }}>
              Quay lại chọn nguồn
            </button>
          </section>
        </div>
      )}
      <header className="topbar app-header">
        <div className="header-brand">
          <div className="header-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M7 2v3M17 2v3M3.5 9h17M5.5 4h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
              <path d="m8 15 2.2 2.2L16.5 11" />
            </svg>
          </div>
          <div className="header-copy">
            <p className="eyebrow">AttendanceSystem</p>
            <h1>Quản lý chấm công</h1>
            <p className="header-subtitle">Phân tích Excel, quản lý nhân viên và lưu trữ dữ liệu theo tháng.</p>
          {ROLE_LOGIN_ENABLED && auth && (
            <p className="role-line">
              Đang đăng nhập: {auth.user.display_name || auth.user.email} · {isOwner ? 'Chủ' : 'Nhân viên kiểm tra'}
            </p>
          )}
          <div className="factory-switch" role="group" aria-label="Chọn xưởng">
            <button
              type="button"
              className={factoryMode === 'factory1' ? 'active' : ''}
              onClick={() => changeFactoryMode('factory1')}
            >
              Xưởng 1
            </button>
            <button
              type="button"
              className={factoryMode === 'factory2' ? 'active' : ''}
              onClick={() => changeFactoryMode('factory2')}
            >
              Xưởng 2
            </button>
          </div>
          </div>
        </div>
        <div className="header-side">
          <div className="header-meta">
            <span className="system-status"><i />Hệ thống sẵn sàng</span>
            <button type="button" className="support-header-button" onClick={() => setSupportOpen(true)}>
              Hỗ trợ kỹ thuật
            </button>
            {isOwner && (
              <button
                type="button"
                className={`bank-header-button${activeView === 'bank' ? ' active' : ''}`}
                onClick={() => setActiveView(activeView === 'bank' ? 'employees' : 'bank')}
                title="Mở bảng lương gửi ngân hàng"
              >
                {activeView === 'bank' ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6M9 12h11" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18M12 3l9 5H3l9-5Z" /></svg>
                )}
                {activeView === 'bank' ? 'Quay lại' : 'Ngân hàng'}
              </button>
            )}
            {factoryMode === 'factory1' && legacyConverterEnabled && (
              <button
                type="button"
                className="factory2-converter-header-button"
                onClick={() => setFactory1LegacyDialogOpen(true)}
                title="Chuyển bảng cũ của Xưởng 1 sang bảng ngang khung mới"
              >
                Chuyển bảng cũ X1
              </button>
            )}
            {factoryMode === 'factory2' && legacyConverterEnabled && (
              <button
                type="button"
                className="factory2-converter-header-button"
                onClick={() => setFactory2LegacyDialogOpen(true)}
                title="Chuyển bảng dọc cũ của Xưởng 2 sang bảng ngang khung mới"
              >
                Chuyển bảng cũ X2
              </button>
            )}
            <button
              type="button"
              className="smart-settings-button"
              aria-label="Mở cài đặt kiểm tra và gán file"
              title="Cài đặt xử lý file"
              onClick={() => setSmartSettingsOpen(true)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Z" />
                <path d="m19 13.5 1.4 1.1-2 3.5-1.8-.7a7.7 7.7 0 0 1-2.1 1.2l-.3 1.9h-4l-.3-1.9a7.7 7.7 0 0 1-2.1-1.2l-1.8.7-2-3.5 1.4-1.1a7.5 7.5 0 0 1 0-2.5L4 9.9l2-3.5 1.8.7a7.7 7.7 0 0 1 2.1-1.2l.3-1.9h4l.3 1.9a7.7 7.7 0 0 1 2.1 1.2l1.8-.7 2 3.5L19 11a7.5 7.5 0 0 1 0 2.5Z" />
              </svg>
            </button>
          </div>
          {data && (
            <div className="topbar-actions">
              <button type="button" className="download-button" disabled={output1Loading} onClick={exportOutput1}>
                {output1Loading ? 'Đang xuất Output 1...' : 'Tải Output 1'}
              </button>
              {isOwner && (
                <button type="button" className="download-button" disabled={payrollLoading} onClick={exportOutput2}>
                  {payrollLoading ? 'Đang xuất Output 2...' : 'Tải Output 2'}
                </button>
              )}
              <button
                type="button"
                className="download-button secondary-button"
                disabled={cardExportLoading !== null}
                onClick={() => setEmployeeCardChoiceOpen(true)}
                aria-busy={cardExportLoading !== null}
              >
                {cardExportLoading && <span className="button-spinner" aria-hidden="true" />}
                {cardExportLoading ? 'Đang xuất ảnh...' : 'Xuất ảnh bảng công NV'}
              </button>
              {ROLE_LOGIN_ENABLED && !isOwner && (
                <button type="button" className="download-button" disabled={submitLoading} onClick={submitToOwner}>
                  {submitLoading ? 'Đang gửi...' : 'Gửi cho chủ'}
                </button>
              )}
            </div>
          )}
          {ROLE_LOGIN_ENABLED && (
            <button type="button" className="secondary-button header-logout" onClick={logout}>
              Đăng xuất
            </button>
          )}
        </div>
      </header>

      {activeView !== 'bank' && (
        <WorkflowGuide
          factory={factoryMode}
          data={data}
          hydrated={workspaceHydrated}
          pendingReviewCount={pendingReviewCount}
          payrollSyncPending={payrollSyncPending}
          missingPayrollCount={missingPayrollCount}
          missingBankCount={missingBankCount}
          historySaved={currentHistorySaved}
          finalCopySaved={currentFinalCopySaved}
        />
      )}

      {activeView === 'bank' ? (
        <BankPayrollView factory={factoryMode} onConfirm={askForConfirmation} />
      ) : (
      <>
      {supportOpen && (
        <div className="support-backdrop" role="presentation" onMouseDown={() => setSupportOpen(false)}>
          <section
            className="support-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="support-dialog-heading">
              <div>
                <p className="export-choice-kicker">Kênh hỗ trợ trực tiếp</p>
                <h2 id="support-dialog-title">Liên hệ hỗ trợ kỹ thuật</h2>
                <p>Quét mã Zalo hoặc chọn một kênh bên dưới để báo lỗi và nhận hỗ trợ.</p>
              </div>
              <button type="button" className="settings-close-button" aria-label="Đóng hỗ trợ kỹ thuật" onClick={() => setSupportOpen(false)}>
                ×
              </button>
            </div>
            <div className="support-dialog-body">
              <div className="support-qr-card">
                <img src="/zalo-qr.png" alt="Mã QR liên hệ Zalo Nguyễn Minh Son" />
                <span>Mở Zalo và quét mã để kết nối</span>
              </div>
              <div className="support-contact-list">
                <a href="tel:0905885029" className="support-contact-card">
                  <span className="support-contact-icon" aria-hidden="true">☎</span>
                  <span><small>Điện thoại</small><strong>0905 885 029</strong></span>
                  <span className="support-contact-arrow" aria-hidden="true">↗</span>
                </a>
                <a href="mailto:sonnm.23ai@vku.udn.vn" className="support-contact-card">
                  <span className="support-contact-icon" aria-hidden="true">@</span>
                  <span><small>Email</small><strong>sonnm.23ai@vku.udn.vn</strong></span>
                  <span className="support-contact-arrow" aria-hidden="true">↗</span>
                </a>
                <a href="https://zalo.me/0905885029" target="_blank" rel="noreferrer" className="support-contact-card">
                  <span className="support-contact-icon support-zalo-icon" aria-hidden="true">Z</span>
                  <span><small>Zalo</small><strong>Nhắn tin báo lỗi website</strong></span>
                  <span className="support-contact-arrow" aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
            <p className="support-dialog-note">Nguyễn Minh Son · Trường Đại học Công nghệ Thông tin và Truyền thông Việt - Hàn, Đại học Đà Nẵng</p>
          </section>
        </div>
      )}
      {smartSettingsOpen && (
        <div className="smart-settings-backdrop" role="presentation" onMouseDown={() => setSmartSettingsOpen(false)}>
          <section
            className="smart-settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="smart-settings-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="smart-settings-heading">
              <div>
                <p className="export-choice-kicker">Cài đặt xử lý file</p>
                <h2 id="smart-settings-title">Kiểm tra và gán thông minh</h2>
              </div>
              <button type="button" className="settings-close-button" aria-label="Đóng cài đặt" onClick={() => setSmartSettingsOpen(false)}>
                ×
              </button>
            </div>
            <div className="smart-setting-row">
              <div>
                <strong>Kiểm tra file thông minh</strong>
                <span>Bật để nhận diện nhầm loại bảng, sai kỳ hoặc cấu trúc bất thường trước khi chạy.</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={smartScanEnabled}
                className={`toggle-switch${smartScanEnabled ? ' active' : ''}`}
                onClick={() => {
                  setSmartScanEnabled((current) => !current)
                  setError(null)
                  setMessage(null)
                }}
              >
                <i />
                <span>{smartScanEnabled ? 'Bật' : 'Tắt'}</span>
              </button>
            </div>
            <div className="smart-setting-row factory2-setting-row">
                <div>
                  <strong>Hiện nút chuyển bảng cũ cho Xưởng 1 và Xưởng 2</strong>
                  <span>Bật để hiện nút riêng trên thanh đầu trang của từng xưởng. Xưởng 1 nhận cả file .xls và tạo khung mới có công thức.</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={legacyConverterEnabled}
                  className={`toggle-switch${legacyConverterEnabled ? ' active' : ''}`}
                  onClick={() => setLegacyConverterEnabled((current) => !current)}
                >
                  <i />
                  <span>{legacyConverterEnabled ? 'Bật' : 'Tắt'}</span>
                </button>
              </div>
            <div className="smart-setting-row">
              <div className="smart-setting-local-copy">
                <strong>Thư mục lưu cục bộ bảng lương</strong>
                <span>Chọn thư mục trên máy để lựa chọn “Lưu cục bộ” ghi file Excel vào đó. Nếu để trống, app dùng thư mục local_exports.</span>
                <input
                  className="smart-setting-path-input"
                  value={cloudForm.local_export_dir}
                  placeholder="Ví dụ: C:\\AttendanceSystem\\BangLuong"
                  onChange={(event) => setCloudForm((current) => ({ ...current, local_export_dir: event.target.value }))}
                />
                <button type="button" className="secondary-button smart-setting-save-button" disabled={cloudLoading} onClick={() => void saveCloudConfig()}>
                  {cloudLoading ? 'Đang lưu...' : 'Lưu thư mục cục bộ'}
                </button>
              </div>
            </div>
            <div className="smart-setting-row">
              <div>
                <strong>Gán theo mã và tiêu đề</strong>
                <span>Bật để dò dữ liệu bảng cũ theo mã và ý nghĩa cột; tắt để dùng cách gán vị trí cũ.</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={smartMappingEnabled}
                className={`toggle-switch${smartMappingEnabled ? ' active' : ''}`}
                onClick={() => {
                  setSmartMappingEnabled((current) => !current)
                  setError(null)
                  setMessage(null)
                }}
              >
                <i />
                <span>{smartMappingEnabled ? 'Bật' : 'Tắt'}</span>
              </button>
            </div>
            <div className="smart-setting-row">
              <div>
                <strong>Khóa nhập thủ công</strong>
                <span>Khi bật, thông tin ở mục Nhân viên và Bảng lương / Output 2 chỉ nhận từ bản sao cuối cùng. Muốn nhập tay phải tắt khóa này.</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={manualEntryLocked}
                className={`toggle-switch${manualEntryLocked ? ' active' : ''}`}
                onClick={() => {
                  setManualEntryLocked((current) => !current)
                  setError(null)
                  setMessage(null)
                }}
              >
                <i />
                <span>{manualEntryLocked ? 'Đã khóa' : 'Cho phép'}</span>
              </button>
            </div>
            <div className="smart-setting-row">
              <div>
                <strong>Quyền lợi ngày đầu nhân viên mới</strong>
                <span>Bật để tự quy đổi mốc chuẩn cho ca đầu của mã mới; tắt nếu chưa có lịch sử nhân viên cũ để tránh cộng giờ nhầm.</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={newcomerBenefitEnabled}
                className={`toggle-switch${newcomerBenefitEnabled ? ' active' : ''}`}
                onClick={() => void changeNewcomerBenefitEnabled(!newcomerBenefitEnabled)}
                disabled={loading}
              >
                <i />
                <span>{newcomerBenefitEnabled ? 'Bật' : 'Tắt'}</span>
              </button>
            </div>
            <div className="smart-setting-row smart-setting-child">
              <div>
                <strong>Yêu cầu kiểm tra ca tự cộng</strong>
                <span>Hiển thị riêng các ca được tự cộng công do hệ thống nhận diện mã mới; cần xác nhận trước khi lưu hoặc xuất.</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showNewcomerBenefitReview}
                className={`toggle-switch${showNewcomerBenefitReview ? ' active' : ''}`}
                onClick={() => setShowNewcomerBenefitReview((current) => !current)}
                disabled={!newcomerBenefitEnabled || loading}
              >
                <i />
                <span>{showNewcomerBenefitReview ? 'Bật' : 'Tắt'}</span>
              </button>
            </div>
            <div className="smart-setting-divider" aria-hidden="true" />
            <p className="smart-settings-section-label">Hiển thị bảng phân tích</p>
            <div className="smart-setting-row">
              <div>
                <strong>Danh sách mã nhân viên</strong>
                <span>Ẩn/hiện danh sách mã và tổng giờ ở cột bên trái của trang Output 1.</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showEmployeeList}
                className={`toggle-switch${showEmployeeList ? ' active' : ''}`}
                onClick={() => setShowEmployeeList((current) => !current)}
              >
                <i />
                <span>{showEmployeeList ? 'Hiện' : 'Ẩn'}</span>
              </button>
            </div>
            <div className="smart-setting-row">
              <div>
                <strong>Chi tiết công</strong>
                <span>Ẩn/hiện khung chi tiết công và danh sách nhân viên trong trang Output 1.</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showWorkDetail}
                className={`toggle-switch${showWorkDetail ? ' active' : ''}`}
                onClick={() => setShowWorkDetail((current) => !current)}
              >
                <i />
                <span>{showWorkDetail ? 'Hiện' : 'Ẩn'}</span>
              </button>
            </div>
            <div className="smart-setting-row">
              <div>
                <strong>Cần kiểm tra thủ công</strong>
                <span>Ẩn/hiện danh sách các dòng cần người dùng xem lại.</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showManualChecks}
                className={`toggle-switch${showManualChecks ? ' active' : ''}`}
                onClick={() => setShowManualChecks((current) => !current)}
              >
                <i />
                <span>{showManualChecks ? 'Hiện' : 'Ẩn'}</span>
              </button>
            </div>
            <p className="smart-settings-note">Hai công tắc này chỉ thay đổi phần hiển thị; dữ liệu tính toán và file xuất vẫn được giữ nguyên.</p>
            {!smartScanEnabled && (
              <p className="smart-settings-warning">
                Khi tắt kiểm tra, app vẫn xử lý file nhưng sẽ không cảnh báo trước nếu chọn nhầm loại bảng hoặc nhầm kỳ.
              </p>
            )}
          </section>
        </div>
      )}

      {mappingBankInspection && (
        <div className="export-choice-backdrop" role="presentation" onMouseDown={() => !mappingLoading && setMappingBankInspection(null)}>
          <section
            className="export-choice-dialog mapping-bank-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mapping-bank-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="export-choice-kicker">KIỂM TRA TÀI KHOẢN TRƯỚC KHI GÁN</p>
            <h2 id="mapping-bank-title">Phát hiện dữ liệu ngân hàng cần xác nhận</h2>
            <p className="export-choice-description">
              Output 2 sau khi gán sẽ lấy tài khoản từ kho Ngân hàng theo mã nhân viên. Bạn có thể nhập số mới, dùng số trong bản cũ,
              giữ số đang lưu hoặc cho phép xuất tạm mã chưa có tài khoản.
            </p>

            {mappingBankInspection.missing_bank_accounts.length > 0 && (
              <div className="mapping-bank-section">
                <h3>Thiếu tài khoản ({mappingBankInspection.missing_bank_accounts.length})</h3>
                <div className="mapping-bank-list">
                  {mappingBankInspection.missing_bank_accounts.map((item) => {
                    const decision = mappingBankDecisions[item.employee_code] ?? { mode: 'custom' as const, account: '' }
                    return (
                      <div className={`mapping-bank-row${item.candidate_account ? '' : ' mapping-bank-row-direct'}`} key={`missing-${item.employee_code}`}>
                        <div><strong>{item.employee_code}</strong><span>{item.name || 'Chưa có tên'}</span></div>
                        {item.candidate_account ? (
                          <select
                            value={decision.mode}
                            onChange={(event) => setMappingBankDecisions((current) => ({
                              ...current,
                              [item.employee_code]: { ...decision, mode: event.target.value as MappingBankDecision['mode'] },
                            }))}
                          >
                            <option value="custom">Nhập tay</option>
                            <option value="candidate">Dùng số từ bản cũ ({item.candidate_account})</option>
                          </select>
                        ) : null}
                        {decision.mode === 'custom' && (
                          <input
                            className="table-input mapping-bank-input"
                            inputMode="numeric"
                            placeholder="Nhập 8–20 chữ số"
                            value={decision.account}
                            onChange={(event) => setMappingBankDecisions((current) => ({
                              ...current,
                              [item.employee_code]: { ...decision, account: event.target.value.replace(/\D/g, '') },
                            }))}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {mappingBankInspection.changed_bank_accounts.length > 0 && (
              <div className="mapping-bank-section">
                <h3>Tài khoản khác với số đang lưu ({mappingBankInspection.changed_bank_accounts.length})</h3>
                <div className="mapping-bank-list">
                  {mappingBankInspection.changed_bank_accounts.map((item) => {
                    const decision = mappingBankDecisions[item.employee_code] ?? { mode: 'keep' as const, account: item.saved_account }
                    return (
                      <div className="mapping-bank-row" key={`changed-${item.employee_code}`}>
                        <div><strong>{item.employee_code}</strong><span>{item.name || 'Chưa có tên'}</span></div>
                        <select
                          value={decision.mode}
                          onChange={(event) => setMappingBankDecisions((current) => ({
                            ...current,
                            [item.employee_code]: { ...decision, mode: event.target.value as MappingBankDecision['mode'] },
                          }))}
                        >
                          <option value="keep">Giữ số đang lưu ({item.saved_account})</option>
                          <option value="candidate">Dùng số từ bản cũ ({item.candidate_account})</option>
                          <option value="custom">Nhập số khác</option>
                        </select>
                        {decision.mode === 'custom' && (
                          <input
                            className="table-input mapping-bank-input"
                            inputMode="numeric"
                            placeholder="Nhập 8–20 chữ số"
                            value={decision.account}
                            onChange={(event) => setMappingBankDecisions((current) => ({
                              ...current,
                              [item.employee_code]: { ...decision, account: event.target.value.replace(/\D/g, '') },
                            }))}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {mappingBankInspection.missing_bank_accounts.length > 0 && (
              <label className="mapping-bank-allow-missing">
                <input
                  type="checkbox"
                  checked={mappingAllowMissingBankAccounts}
                  onChange={(event) => setMappingAllowMissingBankAccounts(event.target.checked)}
                />
                <span>Cho phép gán tạm mã thiếu tài khoản (Output 2 sẽ để trống các mã đó)</span>
              </label>
            )}
            <div className="export-choice-options mapping-bank-actions">
              <button type="button" className="export-choice-card bank-save-choice" disabled={mappingLoading} onClick={() => void confirmOwnerMappingBankAccounts()}>
                <strong>{mappingLoading ? 'Đang gán...' : 'Xác nhận và Gán & xuất'}</strong>
                <span>Tài khoản đã xác nhận sẽ lưu vào kho Ngân hàng và cố gắng sao lưu lên Drive.</span>
              </button>
              <button type="button" className="export-choice-card formula-only" disabled={mappingLoading} onClick={() => setMappingBankInspection(null)}>
                <strong>Hủy thao tác gán</strong>
                <span>Không tạo Output mới và không thay đổi kho tài khoản.</span>
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingFactorySwitch && (
        <div className="export-choice-backdrop factory-switch-backdrop" role="presentation" onMouseDown={() => setPendingFactorySwitch(null)}>
          <section
            className="factory-switch-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="factory-switch-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="factory-switch-dialog-icon" aria-hidden="true">!</div>
            <div className="factory-switch-dialog-copy">
              <p className="export-choice-kicker">Đang có phiên làm việc tạm</p>
              <h2 id="factory-switch-title">
                Chuyển sang {pendingFactorySwitch === 'factory1' ? 'Xưởng 1' : 'Xưởng 2'}?
              </h2>
              <p>
                Bạn đang làm dở dữ liệu của {factoryMode === 'factory1' ? 'Xưởng 1' : 'Xưởng 2'}.
                Nếu tiếp tục, phiên này sẽ được cất riêng theo xưởng và màn hình chuyển sang phiên của xưởng đích (nếu có).
              </p>
              <div className="factory-switch-dialog-note">
                Phiên đang làm dở không bị xóa. Nó chỉ mất khi bạn chọn một file mới trong chính xưởng này.
              </div>
            </div>
            <div className="factory-switch-dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setPendingFactorySwitch(null)}>
                Ở lại {factoryMode === 'factory1' ? 'Xưởng 1' : 'Xưởng 2'}
              </button>
              <button type="button" className="primary-button" onClick={confirmFactorySwitch}>
                Cất phiên và chuyển xưởng
              </button>
            </div>
          </section>
        </div>
      )}

      {output2BankMissing.length > 0 && (
        <div className="export-choice-backdrop" role="presentation" onMouseDown={() => setOutput2BankMissing([])}>
          <section
            className="export-choice-dialog mapping-bank-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="output2-bank-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="export-choice-kicker">KIỂM TRA TÀI KHOẢN TRƯỚC KHI XUẤT</p>
            <h2 id="output2-bank-title">Phát hiện mã nhân viên chưa có số ngân hàng</h2>
            <p className="export-choice-description">
              Đây là các mã có giờ công trong tháng hiện tại nhưng kho Ngân hàng chưa có tài khoản. Nhập số tại đây để lưu vào kho dùng cho các tháng sau.
            </p>
            <div className="mapping-bank-section">
              <div className="mapping-bank-list">
                {output2BankMissing.map((employee) => (
                  <div className="mapping-bank-row" key={`output2-missing-${employee.employee_code}`}>
                    <div><strong>{employee.employee_code}</strong><span>{employee.name || 'Chưa có tên'}</span></div>
                    <input
                      className="table-input mapping-bank-input"
                      inputMode="numeric"
                      placeholder="Nhập 8–20 chữ số"
                      value={output2BankAccounts[employee.employee_code] || ''}
                      onChange={(event) => setOutput2BankAccounts((current) => ({
                        ...current,
                        [employee.employee_code]: event.target.value.replace(/\D/g, ''),
                      }))}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="export-choice-options mapping-bank-actions">
              <button type="button" className="export-choice-card bank-save-choice" disabled={payrollLoading} onClick={() => void confirmOutput2BankAccounts()}>
                <strong>{payrollLoading ? 'Đang lưu...' : 'Nhập thông tin thiếu rồi xuất'}</strong>
                <span>Số hợp lệ được lưu vào kho Ngân hàng; Drive sẽ được sao lưu nếu đã cài.</span>
              </button>
              <button type="button" className="export-choice-card formula-only" disabled={payrollLoading} onClick={() => void exportOutput2WithMissingBankAccounts()}>
                <strong>Xuất bản hiện tại</strong>
                <span>Vẫn xuất Output 2 ngay và để trống tài khoản của các mã đang thiếu.</span>
              </button>
            </div>
            <button type="button" className="secondary-button export-choice-cancel" disabled={payrollLoading} onClick={() => setOutput2BankMissing([])}>
              Hủy
            </button>
          </section>
        </div>
      )}

      {factory1LegacyDialogOpen && factoryMode === 'factory1' && (
        <div className="export-choice-backdrop" role="presentation" onMouseDown={() => !factory1LegacyLoading && setFactory1LegacyDialogOpen(false)}>
          <section
            className="export-choice-dialog factory2-converter-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="factory1-converter-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="export-choice-kicker">Công cụ riêng · Xưởng 1</p>
            <h2 id="factory1-converter-title">Chuyển bảng cũ Xưởng 1 sang khung mới</h2>
            <p>Chọn file chấm công cũ (.xls, .xlsx hoặc .xlsm). Hệ thống sẽ đưa dữ liệu sang khung mới có công thức.</p>
            <div className="factory2-converter-file">
              <ExcelDropZone
                id="factory1-legacy-file"
                file={factory1LegacyFile}
                placeholder="Bảng cũ Xưởng 1"
                busy={factory1LegacyLoading ? 'Đang tạo khung mới...' : null}
                disabled={factory1LegacyLoading}
                allowLegacyXls
                onFile={selectFactory1LegacyFile}
              />
            </div>
            <div className="factory2-converter-note">
              Khung mới giữ mã, tên, mức lương, giờ làm thêm, Bắt đầu làm và ghi chú của bảng cũ; ngân hàng không được nhập. Các cột tính lương sẽ dùng công thức của khung mới, sau đó file được đặt sẵn vào Bản sao cuối cùng Xưởng 1 để bạn kiểm tra và lưu.
            </div>
            <div className="employee-card-archive-actions">
              <button type="button" className="secondary-button" disabled={factory1LegacyLoading} onClick={() => setFactory1LegacyDialogOpen(false)}>
                Hủy
              </button>
              <button type="button" className="primary-button" disabled={!factory1LegacyFile || factory1LegacyLoading} onClick={() => void convertFactory1LegacyWorkbook()}>
                {factory1LegacyLoading ? 'Đang chuyển...' : 'Chuyển sang khung mới'}
              </button>
            </div>
          </section>
        </div>
      )}

      {factory2LegacyDialogOpen && factoryMode === 'factory2' && (
        <div className="export-choice-backdrop" role="presentation" onMouseDown={() => !factory2LegacyLoading && setFactory2LegacyDialogOpen(false)}>
          <section
            className="export-choice-dialog factory2-converter-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="factory2-converter-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="export-choice-kicker">Công cụ riêng · Xưởng 2</p>
            <h2 id="factory2-converter-title">Chuyển bảng cũ sang Output mới</h2>
            <p>Chọn loại file cần tạo. Output 2 dùng khung công thức mới và giữ lại thông tin lương của đúng bảng cũ nếu có.</p>
            <div className="factory2-converter-kind" role="group" aria-label="Chọn loại Output cần chuyển">
              <button
                type="button"
                className={factory2LegacyOutputKind === 'output1' ? 'active' : ''}
                disabled={factory2LegacyLoading}
                onClick={() => setFactory2LegacyOutputKind('output1')}
              >
                <strong>Output 1</strong>
                <span>Khung chấm công ngang</span>
              </button>
              <button
                type="button"
                className={factory2LegacyOutputKind === 'output2' ? 'active' : ''}
                disabled={factory2LegacyLoading}
                onClick={() => setFactory2LegacyOutputKind('output2')}
              >
                <strong>Output 2</strong>
                <span>Khung lương mới có công thức</span>
              </button>
            </div>
            <div className="factory2-converter-file">
              <ExcelDropZone
                id="factory2-legacy-file"
                file={factory2LegacyFile}
                placeholder="Bảng dọc cũ Xưởng 2"
                busy={factory2LegacyLoading ? `Đang tạo ${factory2LegacyOutputKind === 'output2' ? 'Output 2' : 'Output 1'}...` : null}
                disabled={factory2LegacyLoading}
                onFile={selectFactory2LegacyFile}
              />
            </div>
            <div className="factory2-converter-note">
              {factory2LegacyOutputKind === 'output2'
                ? 'Output 2 sẽ mang theo tên, lương, thưởng, phạt và ứng lương có trong bảng cũ; sau khi chuyển, file được đặt sẵn vào mục Bản sao cuối cùng của Xưởng 2 để bạn kiểm tra và lưu.'
                : 'Output 1 chỉ chuyển phần chấm công sang khung ngang. File gốc không bị thay đổi.'}
            </div>
            <div className="employee-card-archive-actions">
              <button type="button" className="secondary-button" disabled={factory2LegacyLoading} onClick={() => setFactory2LegacyDialogOpen(false)}>
                Hủy
              </button>
              <button type="button" className="primary-button" disabled={!factory2LegacyFile || factory2LegacyLoading} onClick={() => void convertFactory2LegacyWorkbook()}>
                {factory2LegacyLoading ? 'Đang chuyển...' : `Chuyển sang ${factory2LegacyOutputKind === 'output2' ? 'Output 2' : 'Output 1'}`}
              </button>
            </div>
          </section>
        </div>
      )}

      {output2ChoiceOpen && (
        <div className="export-choice-backdrop" role="presentation" onMouseDown={() => setOutput2ChoiceOpen(false)}>
          <section
            className="export-choice-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="output2-choice-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="export-choice-kicker">Tải Output 2</p>
            <h2 id="output2-choice-title">Bạn muốn xuất theo dạng nào?</h2>
            <p>
              Dữ liệu chấm công và mã nhân viên luôn được giữ. Bạn chọn có hoặc không mang theo dữ liệu
              hồ sơ lương, thưởng và ghi chú đang lưu trên máy. Phạt NQ và ứng lương tháng này không tự điền.
            </p>
            <div className="export-choice-options">
              <button type="button" className="export-choice-card" onClick={() => void runOutput2Export(true)}>
                <strong>Có dữ liệu đã lưu</strong>
                <span>Điền sẵn tên, mức lương, thưởng và ghi chú; vẫn để trống phạt NQ và ứng lương.</span>
              </button>
              <button type="button" className="export-choice-card formula-only" onClick={() => void runOutput2Export(false)}>
                <strong>Chỉ giữ công thức</strong>
                <span>Để trống dữ liệu lương trên máy; chủ tự nhập vào file Excel.</span>
              </button>
            </div>
            <button type="button" className="secondary-button export-choice-cancel" onClick={() => setOutput2ChoiceOpen(false)}>
              Hủy
            </button>
          </section>
        </div>
      )}

      <section className="upload-panel" id="analysis-upload">
        <div className="upload-copy">
          <strong>Thêm bảng Excel</strong>
          <span>Phiên đang làm dở được giữ tạm trên máy và tự khôi phục sau khi restart; chưa ghi vào lịch sử hoặc Drive.</span>
        </div>
        <ExcelDropZone
          id="excel-file"
          file={file}
          displayName={restoredAnalysisFilename}
          placeholder="Bảng chấm công gốc"
          busy={fileInspectingRole === 'analysis' ? 'Đang nhận diện file...' : null}
          disabled={loading}
          onFile={selectAnalysisFile}
        />
        <div className="analysis-actions">
          <button type="button" disabled={!file || loading} onClick={analyze}>
            {loading ? 'Đang phân tích...' : 'Phân tích tạm'}
          </button>
          {loading && (
            <button type="button" className="secondary-button" onClick={cancelAnalysis}>
              Hủy phân tích
            </button>
          )}
        </div>
      </section>

      <section className="upload-panel mapping-panel">
        <div className="upload-copy">
          <strong>Gán dữ liệu</strong>
          <span>Gán theo mã nhân viên.</span>
        </div>
        <div className="mapping-file-field">
          <span>Output 1 tháng mới</span>
          <ExcelDropZone
            id="mapping-current-file"
            file={mappingCurrentFile}
            placeholder="Thêm file Output 1"
            busy={fileInspectingRole === 'mapping_current' ? 'Đang kiểm tra Output 1...' : null}
            disabled={mappingLoading}
            onFile={(selectedFile) => selectMappingFile(selectedFile, 'mapping_current')}
          />
        </div>
        <div className="mapping-file-field">
          <span>Bảng chính thức tháng cũ</span>
          <ExcelDropZone
            id="mapping-previous-file"
            file={mappingPreviousFile}
            placeholder="Thêm bảng chính thức"
            busy={fileInspectingRole === 'mapping_previous' ? 'Đang kiểm tra bảng chính thức...' : null}
            disabled={mappingLoading}
            onFile={(selectedFile) => selectMappingFile(selectedFile, 'mapping_previous')}
          />
        </div>
        <button type="button" disabled={!mappingCurrentFile || !mappingPreviousFile || mappingLoading} onClick={mapOwnerData}>
          {mappingLoading ? 'Đang gán...' : 'Gán & xuất'}
        </button>
      </section>

      <section className="upload-panel drive-save-panel">
        <div className="upload-copy">
          <strong>Lưu vào Drive</strong>
          <span>Lưu file đang xử lý hoặc file chốt cuối cùng vào đúng thư mục tháng.</span>
        </div>
        <div className="drive-save-options">
          <div className="drive-save-card">
            <div>
              <strong>Bản đang phân tích</strong>
              <span>{data?.period?.label ? `Kỳ ${data.period.label}` : 'Phân tích tạm xong mới lưu được'}</span>
            </div>
            <div className="drive-save-controls">
              <InlinePeriodInput label="Tháng" value={periodMonth} onChange={setPeriodMonth} min="1" max="12" />
              <InlinePeriodInput label="Năm" value={periodYear} onChange={setPeriodYear} min="2000" wide />
              <div className="file-control readonly-file-control" title={data?.filename ?? 'File đang phân tích'}>
                <span>{data?.filename ?? 'File đang phân tích'}</span>
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={!data || !periodMonth || !periodYear || cloudLoading}
                onClick={saveCurrentAnalysisCopy}
              >
                {cloudLoading ? 'Đang lưu...' : 'Lưu bản đang phân tích'}
              </button>
            </div>
          </div>
          <div className="drive-save-card final-copy-card">
            <div>
              <strong>Bản sao cuối cùng</strong>
              <span>Chọn file chốt riêng, kể cả khi chưa lưu lịch sử.</span>
            </div>
            <div className="drive-save-controls">
              <InlinePeriodInput label="Tháng" value={finalCopyMonth} onChange={setFinalCopyMonth} min="1" max="12" />
              <InlinePeriodInput label="Năm" value={finalCopyYear} onChange={setFinalCopyYear} min="2000" wide />
              <ExcelDropZone
                id="main-final-copy-file"
                file={finalCopyFile}
                placeholder="File chốt cuối cùng"
                busy={finalCopyInspecting ? 'Đang kiểm tra file chốt...' : finalCopyConflictChecking ? 'Đang kiểm tra bản chốt cùng tháng...' : null}
                disabled={cloudLoading || finalCopyConflictChecking}
                onFile={selectFinalCopyFile}
              />
              <button
                type="button"
                className={finalCopyInspecting || finalCopyConflictChecking || cloudLoading ? 'is-loading' : ''}
                disabled={!finalCopyFile || !finalCopyMonth || !finalCopyYear || finalCopyInspecting || finalCopyConflictChecking || cloudLoading}
                onClick={requestSaveFinalCopy}
              >
                {(finalCopyInspecting || finalCopyConflictChecking || cloudLoading) && <span className="button-spinner" aria-hidden="true" />}
                {finalCopyInspecting ? 'Đang kiểm tra file...' : finalCopyConflictChecking ? 'Đang kiểm tra bản trùng...' : cloudLoading ? 'Đang lưu...' : 'Lưu bản sao cuối cùng'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="upload-panel recalculation-panel">
        <div className="upload-copy">
          <strong>Tính lại tổng công</strong>
          <span>Chọn file đã sửa tay, rồi chọn dạng file muốn xuất lại.</span>
        </div>
        <ExcelDropZone
          id="recalculate-file"
          file={recalculateFile}
          placeholder={`Chọn file ${recalculateOutputKind === 'output2' ? 'Output 2' : 'Output 1'} đã sửa`}
          busy={fileInspectingRole?.startsWith('recalculate_') ? 'Đang kiểm tra file...' : null}
          disabled={recalculateLoading}
          onFile={selectRecalculateFile}
        />
        <div className="output-kind-control" role="group" aria-label="Chọn dạng file xuất">
          <button
            type="button"
            className={recalculateOutputKind === 'output1' ? 'active' : ''}
            onClick={() => changeRecalculateOutputKind('output1')}
          >
            Output 1
          </button>
          {isOwner && (
            <button
              type="button"
              className={recalculateOutputKind === 'output2' ? 'active' : ''}
              onClick={() => changeRecalculateOutputKind('output2')}
            >
              Output 2
            </button>
          )}
        </div>
        <button type="button" disabled={!recalculateFile || recalculateLoading} onClick={recalculateEditedWorkbook}>
          {recalculateLoading
            ? 'Đang xuất...'
              : !isOwner || recalculateOutputKind === 'output1'
                ? 'Xuất lại Output 1'
                : 'Xuất lại Output 2'}
        </button>
      </section>

      {isOwner && data && (
        <section className="period-panel">
          <Input label="Tháng lưu" value={periodMonth} onChange={setPeriodMonth} type="number" />
          <Input label="Năm lưu" value={periodYear} onChange={setPeriodYear} type="number" />
          <button type="button" disabled={historyLoading || !periodMonth || !periodYear} onClick={saveCurrentToHistory}>
            Lưu vào lịch sử
          </button>
          <p className={pendingReviewCount > 0 ? 'save-review-note warning' : 'save-review-note'}>
            {pendingReviewCount < 0
              ? 'Lịch sử Xưởng 2 sẽ tách riêng sau; hiện tại dùng luồng này để phân tích và xuất Output 2.'
              : pendingReviewCount > 0
              ? `Cần xác nhận ${pendingReviewCount} dòng ở ${currentReviewTableName} trước khi lưu.`
              : 'Các dòng kiểm tra đã được xác nhận; lịch sử sẽ lưu bản Excel đã áp dụng chỉnh sửa.'}
          </p>
        </section>
      )}

      {(
        <nav className="tabs">
          {data && (
            <button
              type="button"
              className={activeView === 'attendance' ? 'active' : ''}
              onClick={() => setActiveView('attendance')}
            >
              Output 1
            </button>
          )}
          {data && (
            <button
              type="button"
              className={activeView === 'payroll' ? 'active' : ''}
              onClick={() => setActiveView('payroll')}
            >
              Bảng lương / Output 2
            </button>
          )}
          {isOwner && (
          <button
            type="button"
            className={activeView === 'employees' ? 'active' : ''}
            onClick={() => {
              setActiveView('employees')
              void loadEmployeeRegistry()
            }}
          >
            Nhân viên
          </button>
          )}
          {isOwner && (
          <button
            type="button"
            className={activeView === 'history' ? 'active' : ''}
            onClick={() => setActiveView('history')}
          >
            Lịch sử
          </button>
          )}
          {isOwner && (
          <button
            type="button"
            className={activeView === 'cloud' ? 'active' : ''}
            onClick={() => {
              setActiveView('cloud')
              void loadCloudConfig()
            }}
          >
            Cloud
          </button>
          )}
          {ROLE_LOGIN_ENABLED && isOwner && (
          <button
            type="button"
            className={activeView === 'inbox' ? 'active' : ''}
            onClick={() => {
              setActiveView('inbox')
              void loadOwnerSubmissions()
            }}
          >
            Hòm thư
          </button>
          )}
          {isOwner && (
          <button
            type="button"
            className={activeView === 'attendanceOverview' ? 'active' : ''}
            onClick={() => {
              setActiveView('attendanceOverview')
              void loadAttendanceOverview(attendanceOverviewYear)
            }}
          >
            Chuyên cần
          </button>
          )}
        </nav>
      )}

      {error && <AppToast kind="error" message={error} onClose={() => setError(null)} />}
      {message && <AppToast kind="success" message={message} onClose={() => setMessage(null)} />}

      {data && activeView === 'attendance' && (
        <AttendanceView
          data={data}
          reviewItems={payrollReviewItems}
          onReviewItemsChange={setPayrollReviewItems}
          showWorkDetail={showWorkDetail}
          showManualChecks={showManualChecks}
          showEmployeeList={showEmployeeList}
          showNewcomerBenefitReview={showNewcomerBenefitReview}
        />
      )}

      {data && activeView === 'payroll' && (
        <PayrollView
          employees={payrollEmployees}
          attendanceData={data}
          attendanceOverview={attendanceOverview}
          filterYear={employeeListYear}
          filterMonth={employeeListMonth}
          reviewItems={payrollReviewItems}
          showNewcomerBenefitReview={showNewcomerBenefitReview}
          latestHistoryInfo={latestHistoryInfo}
          knownHistoryCodes={knownHistoryCodes}
          selectedCode={selectedCode}
          form={form}
          loading={payrollLoading}
          cardExportLoading={cardExportLoading === 'output2'}
          manualEntryLocked={manualEntryLocked}
          onSelect={selectEmployee}
          onFilterYearChange={changeEmployeeListYear}
          onFilterMonthChange={setEmployeeListMonth}
          onFormChange={changeManualPayrollForm}
          onReviewItemsChange={setPayrollReviewItems}
          onSavePatches={savePayrollPatches}
          onSave={savePayroll}
          onManualEntryBlocked={showManualEntryLockedMessage}
          onRequestOutput2Export={exportOutput2}
          onExportCards={() => setEmployeeCardChoiceOpen(true)}
        />
      )}

      {isOwner && activeView === 'employees' && (
        <EmployeeRegistryView
          employees={data && payrollEmployees.length ? payrollEmployees : employeeRegistryForCurrentFactory}
          attendanceData={data}
          attendanceOverview={attendanceOverview}
          filterYear={employeeListYear}
          filterMonth={employeeListMonth}
          latestHistoryInfo={latestHistoryInfo}
          knownHistoryCodes={knownHistoryCodes}
          selectedCode={selectedCode}
          form={form}
          loading={payrollLoading}
          cardExportLoading={cardExportLoading === 'output2'}
          onSelect={data ? selectEmployee : selectRegistryEmployee}
          onCreate={createRegistryEmployee}
          onFilterYearChange={changeEmployeeListYear}
          onFilterMonthChange={setEmployeeListMonth}
          onFormChange={changeManualPayrollForm}
          onSave={savePayroll}
          onRequestOutput2Export={exportOutput2}
          onExportCards={() => setEmployeeCardChoiceOpen(true)}
        />
      )}

      {isOwner && activeView === 'history' && (
        <HistoryView
          periods={historyPeriods}
          finalCopies={historyFinalCopies}
          detail={historyDetail}
          selectedPeriodId={selectedPeriodId}
          selectedFinalCopyId={selectedFinalCopyId}
          selectedEmployeeCode={historySelectedCode}
          filters={historyFilters}
          searchResults={historySearchResults}
          loading={historyLoading}
          onFiltersChange={setHistoryFilters}
          onSearch={searchEmployeeHistory}
          onRefresh={() => loadHistoryPeriods()}
          onConfirm={askForConfirmation}
          onSelectPeriod={selectHistoryPeriod}
          onSelectFinalCopy={selectHistoryFinalCopy}
          onDeletePeriod={deleteHistoryPeriod}
          onDeleteFinalCopy={deleteHistoryFinalCopy}
          onDeleteMonth={deleteHistoryMonth}
          onSelectSearchResult={selectHistorySearchResult}
          onSaveEmployee={saveHistoryEmployee}
          onDownloadOutput={downloadHistoryOutput}
          onDownloadFinalCopy={downloadFinalCopyOutput}
          onDownloadEmployeeImages={downloadHistoryEmployeeImages}
          onDownloadFinalCopyEmployeeImages={downloadFinalCopyEmployeeImages}
        />
      )}

      {isOwner && activeView === 'attendanceOverview' && (
        <AttendanceOverviewView
          overview={attendanceOverview}
          year={attendanceOverviewYear}
          search={attendanceOverviewSearch}
          status={attendanceOverviewStatus}
          selectedCode={attendanceOverviewCode}
          loading={historyLoading}
          onYearChange={setAttendanceOverviewYear}
          onSearchChange={setAttendanceOverviewSearch}
          onStatusChange={setAttendanceOverviewStatus}
          onSelectEmployee={setAttendanceOverviewCode}
          onReload={() => loadAttendanceOverview(attendanceOverviewYear)}
        />
      )}

      {isOwner && activeView === 'cloud' && (
        <CloudSettingsView
          config={cloudConfig}
          form={cloudForm}
          loading={cloudLoading}
          onFormChange={setCloudForm}
          onSave={saveCloudConfig}
          onTest={testCloudConfig}
          onSyncAll={syncAllCloud}
          onBackup={createDriveBackup}
          onBackupExcelAll={backupAllExcelFiles}
          onOpenFolder={openDriveFolder}
        />
      )}

      {isOwner && activeView === 'inbox' && (
        <OwnerInboxView
          submissions={cloudSubmissions}
          loading={cloudLoading}
          onRefresh={loadOwnerSubmissions}
          onProcess={processOwnerSubmission}
        />
      )}
      </>
      )}

      <footer className="app-footer">
        <div className="footer-support">
          <p className="footer-kicker">Hỗ trợ & sửa chữa website</p>
          <h2>Nguyễn Minh Son</h2>
          <p>Trường Đại học Công nghệ Thông tin và Truyền thông Việt - Hàn, Đại học Đà Nẵng</p>
          <div className="footer-contact-links" aria-label="Liên hệ hỗ trợ">
            <a href="tel:0905885029" aria-label="Gọi Nguyễn Minh Son theo số 0905885029">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6.6 10.8a15.8 15.8 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24c1.1.36 2.27.55 3.46.55A1.14 1.14 0 0 1 21 16.65V20a1.14 1.14 0 0 1-1.14 1.14A17 17 0 0 1 2.86 4.14 1.14 1.14 0 0 1 4 3h3.35A1.14 1.14 0 0 1 8.5 4.14c0 1.2.19 2.36.55 3.46a1 1 0 0 1-.24 1Z" />
              </svg>
              0905 885 029
            </a>
            <a href="https://zalo.me/0905885029" target="_blank" rel="noreferrer" aria-label="Nhắn Zalo để báo lỗi website">
              <span className="zalo-mark" aria-hidden="true">Z</span>
              Báo lỗi qua Zalo
            </a>
            <a href="mailto:sonnm.23ai@vku.udn.vn" aria-label="Gửi email đến sonnm.23ai@vku.udn.vn">
              <span className="email-mark" aria-hidden="true">@</span>
              sonnm.23ai@vku.udn.vn
            </a>
          </div>
        </div>

        <div className="footer-shortcuts">
          <p className="footer-kicker">Sang nhanh</p>
          <div className="footer-shortcut-grid">
            {isOwner && (
              <button type="button" onClick={() => { setActiveView('employees'); void loadEmployeeRegistry(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                Nhân viên
              </button>
            )}
            {isOwner && (
              <button type="button" onClick={() => { setActiveView('history'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                Lịch sử
              </button>
            )}
            {isOwner && (
              <button type="button" onClick={() => { setActiveView('attendanceOverview'); void loadAttendanceOverview(attendanceOverviewYear); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                Chuyên cần
              </button>
            )}
            {isOwner && (
              <button type="button" onClick={() => { setActiveView('cloud'); void loadCloudConfig(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                Cloud
              </button>
            )}
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              Lên đầu trang
            </button>
          </div>
          <p className="footer-note">Khi báo lỗi, hãy gửi kèm ảnh màn hình và thao tác vừa thực hiện để được hỗ trợ nhanh hơn.</p>
        </div>

        <div className="footer-bottom">
          <span>AttendanceSystem</span>
          <span>Liên hệ kỹ thuật khi cần bảo trì, sửa lỗi hoặc nâng cấp.</span>
        </div>
      </footer>
    </main>
  )
}

function AppToast({
  kind,
  message,
  onClose,
}: {
  kind: 'success' | 'error'
  message: string
  onClose: () => void
}) {
  return (
    <div className={`app-toast ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="app-toast-icon" aria-hidden="true">{kind === 'success' ? '✓' : '!'}</span>
      <span className="app-toast-message">{message}</span>
      <button type="button" className="app-toast-close" aria-label="Đóng thông báo" onClick={onClose}>×</button>
    </div>
  )
}

type WorkflowStepStatus = 'done' | 'current' | 'ready' | 'optional' | 'locked'

type WorkflowGuideProps = {
  factory: FactoryMode
  data: AnalyzeResponse | null
  hydrated: boolean
  pendingReviewCount: number
  payrollSyncPending: boolean
  missingPayrollCount: number
  missingBankCount: number
  historySaved: boolean
  finalCopySaved: boolean
}

function WorkflowGuide({
  factory,
  data,
  hydrated,
  pendingReviewCount,
  payrollSyncPending,
  missingPayrollCount,
  missingBankCount,
  historySaved,
  finalCopySaved,
}: WorkflowGuideProps) {
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dockOffset, setDockOffset] = useState({ x: 0, y: 0 })
  const suppressLauncherClick = useRef(false)
  const dragState = useRef<{
    pointerId: number
    startX: number
    startY: number
    startOffsetX: number
    startOffsetY: number
    moved: boolean
  } | null>(null)

  if (!hydrated) return null

  const factoryLabel = factory === 'factory2' ? 'Xưởng 2' : 'Xưởng 1'
  const periodLabel = data
    ? data.period.label || (data.period.month && data.period.year ? `Tháng ${String(data.period.month).padStart(2, '0')}/${data.period.year}` : 'Kỳ hiện tại')
    : ''
  const currentStep = !data
    ? 'source'
    : payrollSyncPending
      ? 'sync'
      : pendingReviewCount > 0
        ? 'review'
        : missingPayrollCount > 0
          ? 'payroll'
          : 'export'
  const steps: Array<{ key: string; label: string; detail: string; status: WorkflowStepStatus }> = [
    {
      key: 'source',
      label: 'Nạp & phân tích',
      detail: data ? data.filename : 'Chọn bảng chấm công của kỳ đang làm',
      status: data ? 'done' : 'current',
    },
    {
      key: 'review',
      label: 'Rà soát chấm công',
      detail: !data ? 'Sau khi phân tích file' : pendingReviewCount > 0 ? `Còn ${pendingReviewCount} dòng cần xác nhận` : 'Không còn dòng chờ xác nhận',
      status: !data ? 'locked' : pendingReviewCount > 0 ? 'current' : 'done',
    },
    {
      key: 'payroll',
      label: 'Hồ sơ & lương',
      detail: !data
        ? 'Chỉ bổ sung khi Output 2 cần dùng'
        : payrollSyncPending
          ? 'Đang đồng bộ danh sách nhân viên'
          : missingPayrollCount > 0
            ? `Còn ${missingPayrollCount} mã thiếu tên hoặc lương tháng`
            : 'Thông tin cần thiết đã đủ',
      status: !data || payrollSyncPending ? (payrollSyncPending ? 'current' : 'locked') : missingPayrollCount > 0 ? 'current' : 'done',
    },
    {
      key: 'close',
      label: 'Lưu lại kỳ này',
      detail: !data
        ? 'Lưu lịch sử hoặc bản sao cuối sau khi hoàn tất'
        : historySaved && finalCopySaved
          ? 'Đã lưu lịch sử và bản sao cuối'
          : historySaved
            ? 'Đã có bản trong lịch sử'
            : finalCopySaved
              ? 'Đã có bản sao cuối'
              : 'Có thể lưu sau khi xuất file',
      status: !data ? 'locked' : historySaved || finalCopySaved ? 'done' : 'optional',
    },
  ]
  const completedCount = steps.filter((step) => step.status === 'done').length
  const progress = Math.round((completedCount / steps.length) * 100)

  function handleLauncherPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: dockOffset.x,
      startOffsetY: dockOffset.y,
      moved: false,
    }
  }

  function handleLauncherPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragState.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return
    drag.moved = true
    suppressLauncherClick.current = true

    const dockWidth = Math.min(360, Math.max(280, window.innerWidth - 32))
    const minX = Math.min(0, 24 + dockWidth - window.innerWidth)
    const minY = Math.min(0, 24 + 56 - window.innerHeight)
    setDragging(true)
    setDockOffset({
      x: Math.min(0, Math.max(minX, drag.startOffsetX + deltaX)),
      y: Math.min(24, Math.max(minY, drag.startOffsetY + deltaY)),
    })
  }

  function handleLauncherPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragState.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragState.current = null
    setDragging(false)
  }

  function handleLauncherPointerCancel() {
    dragState.current = null
    setDragging(false)
    suppressLauncherClick.current = false
  }

  let nextTitle = 'Chọn bảng chấm công để bắt đầu'
  let nextDetail = 'App sẽ nhận diện đúng xưởng và tháng từ file, sau đó mới mở các bước tiếp theo.'
  if (data && currentStep === 'sync') {
    nextTitle = 'Đang chuẩn bị dữ liệu nhân viên'
    nextDetail = 'Chờ app đồng bộ xong rồi mới bổ sung hồ sơ hoặc xuất lương.'
  } else if (data && currentStep === 'review') {
    nextTitle = `Xác nhận ${pendingReviewCount} dòng chấm công`
    nextDetail = 'Hoàn tất phần này trước khi lưu lịch sử hoặc xuất file chính thức.'
  } else if (data && currentStep === 'payroll') {
    nextTitle = `Bổ sung hồ sơ/lương cho ${missingPayrollCount} mã`
    nextDetail = 'Chỉ những mã thiếu tên hoặc lương tháng mới cần làm, không phải nhập lại toàn bộ.'
  } else if (data) {
    nextTitle = 'Dữ liệu đã sẵn sàng để xuất'
    nextDetail = 'Chọn đúng loại file cần dùng cho kỳ này. Output 1 là chấm công, Output 2 là công và lương.'
  }

  return (
    <div
      className={`workflow-guide-dock${open ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}`}
      style={{ transform: `translate(${dockOffset.x}px, ${dockOffset.y}px)` }}
    >
      {open && (
        <section className="workflow-guide-float-panel" role="dialog" aria-modal="false" aria-labelledby="workflow-guide-title">
          <div className="workflow-guide-float-header">
            <div>
              <span className="workflow-guide-float-eyebrow">Trợ lý</span>
              <strong id="workflow-guide-title">{data ? `${factoryLabel} · ${periodLabel}` : 'Bắt đầu một kỳ mới'}</strong>
            </div>
            <button type="button" className="workflow-guide-float-close" aria-label="Đóng trợ lý" onClick={() => setOpen(false)}>×</button>
          </div>

          <div className="workflow-guide-float-next">
            <div className="workflow-guide-float-next-icon" aria-hidden="true">{data ? (currentStep === 'export' ? '✓' : '→') : '1'}</div>
            <div className="workflow-guide-float-next-copy">
              <span>Việc cần làm ngay</span>
              <strong>{nextTitle}</strong>
              <p>{nextDetail}</p>
            </div>
          </div>

          <div className="workflow-guide-float-progress-heading">
            <span>{data ? 'Tiến độ kỳ này' : 'Bắt đầu đúng thứ tự'}</span>
            <strong>{data ? `${completedCount}/${steps.length}` : 'Bước 1'}</strong>
          </div>
          <div className="workflow-guide-float-progress-track" aria-hidden="true"><i style={{ width: `${data ? progress : 8}%` }} /></div>

          <div className="workflow-guide-float-steps">
            {steps.map((step, index) => (
              <div className={`workflow-guide-float-step ${step.status}`} key={step.key}>
                <span className={`workflow-guide-float-step-marker ${step.status}`} aria-hidden="true">
                  {step.status !== 'done' && step.status !== 'current' && step.status !== 'optional' ? index + 1 : null}
                </span>
                <div>
                  <strong>{step.label}</strong>
                  <span>{step.detail}</span>
                </div>
                <em>{step.status === 'done' ? 'Xong' : step.status === 'current' ? 'Làm tiếp' : step.status === 'optional' ? 'Nên lưu' : 'Sau đó'}</em>
              </div>
            ))}
          </div>

          {data && missingBankCount > 0 && (
            <div className="workflow-guide-float-warning">
              <span aria-hidden="true">!</span>
              <p>Output 2 cần bổ sung {missingBankCount} tài khoản ngân hàng.</p>
            </div>
          )}

          <p className="workflow-guide-float-readonly-note">Chỉ báo cáo tiến độ; thao tác thực hiện ở màn hình chính.</p>
        </section>
      )}

      <button
        type="button"
        className="workflow-guide-launcher"
        aria-expanded={open}
        aria-label={open ? 'Đóng trợ lý' : 'Mở trợ lý'}
        onPointerDown={handleLauncherPointerDown}
        onPointerMove={handleLauncherPointerMove}
        onPointerUp={handleLauncherPointerUp}
        onPointerCancel={handleLauncherPointerCancel}
        onClick={() => {
          if (suppressLauncherClick.current) {
            suppressLauncherClick.current = false
            return
          }
          setOpen((current) => !current)
        }}
      >
        <span className="workflow-guide-launcher-icon" aria-hidden="true">✦</span>
        <span className="workflow-guide-launcher-label">{open ? 'Đóng' : 'Trợ lý'}</span>
        <span className="workflow-guide-launcher-count">{data ? `${completedCount}/${steps.length}` : '1'}</span>
      </button>
    </div>
  )
}

function InlinePeriodInput({
  label,
  value,
  onChange,
  min,
  max,
  wide = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  wide?: boolean
}) {
  return (
    <label className={`inline-period-field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      />
    </label>
  )
}

type BankEmployee = {
  employee_code: string
  name: string
  salary: number
  account_number: string
  work_days?: number
  conflict_accounts?: string[]
  conflict_codes?: string[]
}

type BankAccountDirectoryRow = {
  factory: FactoryMode
  employee_code: string
  name: string
  account_number: string
  conflict_accounts?: string[]
  conflict_codes?: string[]
  updated_at?: string | null
}

type SalaryImportConflict = {
  employee_code: string
  existing_account: string
  existing_name?: string
  file_accounts: string[]
  accounts: string[]
  name: string
  duplicate_codes?: string[]
  reason?: string
}

type BankAccountOverview = {
  factory: FactoryMode
  accounts: BankAccountDirectoryRow[]
  total: number
  with_account: number
  without_account: number
}

type BankScan = {
  scan_id: string
  month: number | null
  year: number | null
  source_filename: string
  employees: BankEmployee[]
}

function BankPayrollView({ factory, onConfirm }: { factory: FactoryMode; onConfirm: (options: ConfirmationOptions) => Promise<boolean> }) {
  const [bankTab, setBankTab] = useState<'transfer' | 'accounts'>('transfer')
  const [file, setFile] = useState<File | null>(null)
  const [scan, setScan] = useState<BankScan | null>(null)
  const [rows, setRows] = useState<BankEmployee[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [exportChoiceOpen, setExportChoiceOpen] = useState(false)
  const [salaryFile, setSalaryFile] = useState<File | null>(null)
  const [salaryMonth, setSalaryMonth] = useState(String(new Date().getMonth() + 1))
  const [salaryYear, setSalaryYear] = useState(String(new Date().getFullYear()))
  const [salaryConflictOpen, setSalaryConflictOpen] = useState(false)
  const [salaryConflicts, setSalaryConflicts] = useState<SalaryImportConflict[]>([])
  const [salaryConflictChoices, setSalaryConflictChoices] = useState<Record<string, string>>({})
  const [salaryFileDragging, setSalaryFileDragging] = useState(false)
  const [accountOverview, setAccountOverview] = useState<BankAccountOverview | null>(null)
  const [accountSearch, setAccountSearch] = useState('')
  const [accountLoading, setAccountLoading] = useState(false)
  const [savedAccountNumbers, setSavedAccountNumbers] = useState<Record<string, string>>({})
  const [bankFileDragging, setBankFileDragging] = useState(false)
  const activeCodes = scan ? new Set(rows.map((row) => row.employee_code)) : null
  const missing = rows.filter((row) => !row.account_number.trim()).length
  const conflictCount = rows.filter((row) => row.conflict_accounts?.length || row.conflict_codes?.length).length
  const total = rows.reduce((sum, row) => sum + Number(row.salary || 0), 0)
  const visibleRows = rows.filter((row) => {
    const keyword = search.trim().toLowerCase()
    return !keyword || row.employee_code.toLowerCase().includes(keyword) || row.name.toLowerCase().includes(keyword)
  })

  function rememberSavedAccountNumbers(nextRows: BankEmployee[]) {
    setSavedAccountNumbers(Object.fromEntries(nextRows.map((row) => [row.employee_code, row.account_number.trim()])))
  }

  function isUnsavedAccount(row: BankEmployee) {
    return row.account_number.trim() !== (savedAccountNumbers[row.employee_code] ?? '').trim()
  }

  function applyBankScan(nextScan: BankScan) {
    setScan(nextScan)
    setRows(nextScan.employees)
    rememberSavedAccountNumbers(nextScan.employees)
  }

  useEffect(() => {
    if (bankTab !== 'accounts') return
    let cancelled = false
    axios.get<BankAccountOverview>(`${API_BASE}/bank/accounts/overview`, { params: { factory } })
      .then((response) => {
        if (!cancelled) setAccountOverview(response.data)
      })
      .catch(() => {
        if (!cancelled) setAccountOverview(null)
      })
      .finally(() => {
        if (!cancelled) setAccountLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bankTab, factory])

  async function scanFile() {
    if (!file) return
    setBusy('scan')
    setError('')
    setNotice('')
    const form = new FormData()
    form.append('factory', factory)
    form.append('file', file)
    try {
      const response = await axios.post<BankScan>(`${API_BASE}/bank/scan`, form)
      applyBankScan(response.data)
      setNotice(`Đã nhận diện ${response.data.employees.length} nhân viên từ bảng chính thức.`)
    } catch (err) {
      setError(readAxiosError(err, 'Không đọc được bảng lương chính thức'))
    } finally {
      setBusy('')
    }
  }

  async function save() {
    setBusy('save')
    setError('')
    try {
      await axios.post(`${API_BASE}/bank/accounts`, { factory, accounts: rows })
      rememberSavedAccountNumbers(rows)
      setNotice('Đã lưu danh sách số tài khoản an toàn trên máy.')
    } catch (err) {
      setError(readAxiosError(err, 'Không lưu được số tài khoản'))
    } finally {
      setBusy('')
    }
  }

  async function syncDrive(kind: 'backup' | 'restore') {
    setBusy(kind)
    setError('')
    try {
      const response = await axios.post<{ source?: string; month?: number; year?: number; conflicts?: unknown[] }>(
        `${API_BASE}/bank/${kind}-drive?factory=${factory}`,
      )
      if (kind === 'restore' && file) {
        const form = new FormData()
        form.append('factory', factory)
        form.append('file', file)
        const refreshed = await axios.post<BankScan>(`${API_BASE}/bank/scan`, form)
        applyBankScan(refreshed.data)
      }
      setNotice(
        kind === 'backup'
          ? 'Đã sao lưu danh sách tài khoản lên Drive.'
          : response.data.source === 'latest_word'
            ? `Đã lấy Excel lương cũ mới nhất trên Drive${response.data.month && response.data.year ? ` (${response.data.month}/${response.data.year})` : ''}.`
            : 'Đã khôi phục danh sách tài khoản từ Drive.',
      )
    } catch (err) {
      setError(readAxiosError(err, 'Không đồng bộ được với Drive'))
    } finally {
      setBusy('')
    }
  }

  async function selectSalaryFile(selected: File | null) {
    setSalaryFile(selected)
    if (!selected) return
    if (!/\.(xlsx|xlsm)$/i.test(selected.name)) {
      setError('Chỉ nhận file Excel .xlsx hoặc .xlsm.')
      setSalaryFile(null)
      return
    }
    setError('')
    const form = new FormData()
    form.append('file', selected)
    try {
      const response = await axios.post<{ month: number | null; year: number | null }>(`${API_BASE}/bank/inspect-excel-salary`, form)
      if (response.data.month) setSalaryMonth(String(response.data.month))
      if (response.data.year) setSalaryYear(String(response.data.year))
    } catch (err) {
      setError(readAxiosError(err, 'Không đọc được tháng/năm trong Excel lương cũ'))
    }
  }

  async function importSalaryExcel() {
    if (!salaryFile || !salaryMonth || !salaryYear) return
    setBusy('salary')
    setError('')
    setNotice('')
    const form = new FormData()
    form.append('factory', factory)
    form.append('month', salaryMonth)
    form.append('year', salaryYear)
    form.append('file', salaryFile)
    try {
      const response = await axios.post<{
        imported: number
        conflicts: SalaryImportConflict[]
        skipped_existing: string[]
        drive_path: string | null
        month?: number
        year?: number
      }>(`${API_BASE}/bank/import-excel-salary`, form)
      if (response.data.month) setSalaryMonth(String(response.data.month))
      if (response.data.year) setSalaryYear(String(response.data.year))
      if (scan) {
        const refreshed = await axios.post<BankScan>(`${API_BASE}/bank/scan`, (() => {
          const next = new FormData()
          next.append('factory', factory)
          if (file) next.append('file', file)
          return next
        })())
        applyBankScan(refreshed.data)
      }
      const allConflicts = response.data.conflicts || []
      const duplicateConflicts = allConflicts.filter((item) => item.reason === 'duplicate_account' || item.duplicate_codes?.length)
      const conflicts = allConflicts.filter((item) => !duplicateConflicts.includes(item))
      if (conflicts.length) {
        setSalaryConflicts(conflicts)
        setSalaryConflictChoices(Object.fromEntries(conflicts.map((item) => [item.employee_code, ''])))
        setSalaryConflictOpen(true)
      }
      setNotice(
        `Đã bổ sung ${response.data.imported} tài khoản từ Excel lương cũ${response.data.drive_path ? ' và sao lưu theo tháng/năm trên Drive' : ''}.`
        + (response.data.skipped_existing.length ? ` Bỏ qua ${response.data.skipped_existing.length} mã đã có đúng số.` : '')
        + (conflicts.length ? ` Có ${conflicts.length} mã lệch cần chọn.` : '')
        + (duplicateConflicts.length ? ` Có ${duplicateConflicts.length} mã dùng trùng số tài khoản với mã khác; chưa nhập, hãy kiểm tra ở Danh sách tài khoản.` : ''),
      )
    } catch (err) {
      setError(readAxiosError(err, 'Không nhập được danh sách tài khoản từ Excel lương cũ'))
    } finally {
      setBusy('')
    }
  }

  async function applySalaryConflictChoices() {
    const updates = salaryConflicts
      .map((conflict) => ({
        conflict,
        accountNumber: salaryConflictChoices[conflict.employee_code] || '',
      }))
      .filter((item) => item.accountNumber)
    if (updates.length !== salaryConflicts.length) return

    setBusy('salary-conflicts')
    setError('')
    try {
      await axios.post(`${API_BASE}/bank/accounts`, {
        factory,
        accounts: updates.map(({ conflict, accountNumber }) => ({
          employee_code: conflict.employee_code,
          name: conflict.existing_name || conflict.name,
          account_number: accountNumber,
        })),
      })
      setRows((current) => current.map((row) => {
        const update = updates.find((item) => item.conflict.employee_code === row.employee_code)
        return update ? { ...row, account_number: update.accountNumber, conflict_accounts: [] } : row
      }))
      setSavedAccountNumbers((current) => ({
        ...current,
        ...Object.fromEntries(updates.map(({ conflict, accountNumber }) => [conflict.employee_code, accountNumber])),
      }))
      if (bankTab === 'accounts') {
        const refreshed = await axios.get<BankAccountOverview>(`${API_BASE}/bank/accounts/overview`, { params: { factory } })
        setAccountOverview(refreshed.data)
      }
      setSalaryConflictOpen(false)
      setSalaryConflicts([])
      setSalaryConflictChoices({})
      setNotice(`Đã xử lý ${updates.length} mã lệch; mỗi mã đã dùng đúng lựa chọn của bạn.`)
    } catch (err) {
      setError(readAxiosError(err, 'Không cập nhật được các số tài khoản đã chọn'))
    } finally {
      setBusy('')
    }
  }

  async function saveDirectoryAccount(row: BankAccountDirectoryRow, accountNumber: string) {
    if (activeCodes?.has(row.employee_code)) {
      const confirmed = await onConfirm({
        kicker: 'CẬP NHẬT TÀI KHOẢN',
        title: `Mã ${row.employee_code} đã có công trong tháng này`,
        message: 'Bạn chắc chắn muốn sửa số tài khoản của mã này?',
        confirmLabel: 'Sửa số tài khoản',
      })
      if (!confirmed) return
    }
    try {
      await axios.post(`${API_BASE}/bank/accounts`, {
        factory,
        accounts: [{ ...row, account_number: accountNumber }],
      })
      const refreshed = await axios.get<BankAccountOverview>(`${API_BASE}/bank/accounts/overview`, { params: { factory } })
      setAccountOverview(refreshed.data)
      setRows((current) => current.map((item) => item.employee_code === row.employee_code ? { ...item, account_number: accountNumber, conflict_accounts: [], conflict_codes: [] } : item))
      setNotice(`Đã lưu số tài khoản cho mã ${row.employee_code}.`)
    } catch (err) {
      setError(readAxiosError(err, 'Không lưu được số tài khoản'))
      throw err
    }
  }

  async function exportExcel(destination: 'drive' | 'local') {
    if (!scan) return
    setExportChoiceOpen(false)
    setBusy('export')
    setError('')
    try {
      await axios.post(`${API_BASE}/bank/accounts`, { factory, accounts: rows })
      rememberSavedAccountNumbers(rows)
      if (destination === 'drive') {
        await axios.post(`${API_BASE}/bank/backup-drive?factory=${factory}`)
      }
      if (destination === 'local') {
        const saved = await axios.post<{ path: string; filename: string }>(
          `${API_BASE}/bank/export-local`,
          { scan_id: scan.scan_id, accounts: rows },
        )
        setNotice(`Đã lưu file bảng lương cục bộ: ${saved.data.path}`)
        return
      }
      const response = await axios.post(
        `${API_BASE}/bank/export`,
        { scan_id: scan.scan_id, accounts: rows },
        { responseType: 'blob' },
      )
      const month = String(scan.month || 0).padStart(2, '0')
      downloadBlob(response.data, `Xuong${factory === 'factory2' ? 2 : 1}_${scan.year || 'KhongRo'}-${month}_BangLuongNganHang.xlsx`)
      setNotice('Đã lưu danh sách lên Drive và xuất file Excel ngân hàng.')
    } catch (err) {
      setError(await readAxiosErrorAsync(err, 'Không xuất được bảng lương ngân hàng'))
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="bank-workspace">
      {exportChoiceOpen && (
        <div className="export-choice-backdrop" role="presentation" onMouseDown={() => setExportChoiceOpen(false)}>
          <section
            className="export-choice-dialog bank-export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bank-export-choice-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="export-choice-kicker">Xuất Excel ngân hàng</p>
            <h2 id="bank-export-choice-title">Bạn có muốn lưu danh sách này không?</h2>
            <p>
              Nếu lưu, số tài khoản sẽ được ghi nhớ trên máy và sao lưu vào Drive để dùng lại ở tháng sau.
              Nếu không lưu, app chỉ tạo file Excel ngân hàng lần này.
            </p>
            <div className="export-choice-options">
              <button type="button" className="export-choice-card bank-save-choice" onClick={() => void exportExcel('drive')}>
                <strong>Lưu Drive</strong>
                <span>Ghi nhớ số tài khoản, sao lưu lên Drive rồi xuất file Excel ngân hàng.</span>
              </button>
              <button type="button" className="export-choice-card formula-only" onClick={() => void exportExcel('local')}>
                <strong>Lưu cục bộ</strong>
                <span>Ghi nhớ số tài khoản và lưu file vào thư mục cục bộ đã cài đặt trên máy.</span>
              </button>
            </div>
            <button type="button" className="secondary-button export-choice-cancel" onClick={() => setExportChoiceOpen(false)}>Hủy</button>
          </section>
        </div>
      )}
      {salaryConflictOpen && (
        <div className="export-choice-backdrop" role="presentation" onMouseDown={() => !busy && setSalaryConflictOpen(false)}>
          <section
            className="export-choice-dialog bank-export-dialog salary-conflict-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="salary-conflict-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="export-choice-kicker">LỆCH SỐ TÀI KHOẢN</p>
            <h2 id="salary-conflict-title">Chọn số tài khoản muốn giữ</h2>
            <p>File Excel lương cũ chỉ dùng để bổ sung. Các mã bị lệch chưa bị đổi; hãy chọn số cũ hoặc số trong file cho từng mã.</p>
            <div className="salary-conflict-list">
              {salaryConflicts.map((conflict) => (
                <div className="salary-conflict-item" key={conflict.employee_code}>
                  <div className="salary-conflict-heading">
                    <strong>Mã {conflict.employee_code}</strong>
                    <span>{conflict.name || 'Chưa có tên'}</span>
                  </div>
                  <div className="salary-conflict-options">
                    {conflict.existing_account && (
                      <label>
                        <input
                          type="radio"
                          name={`salary-conflict-${conflict.employee_code}`}
                          value={conflict.existing_account}
                          checked={salaryConflictChoices[conflict.employee_code] === conflict.existing_account}
                          onChange={() => setSalaryConflictChoices((current) => ({ ...current, [conflict.employee_code]: conflict.existing_account }))}
                        />
                        <span>Giữ số đã nhập: <b>{conflict.existing_account}</b></span>
                      </label>
                    )}
                    {conflict.file_accounts.map((account) => (
                      <label key={account}>
                        <input
                          type="radio"
                          name={`salary-conflict-${conflict.employee_code}`}
                          value={account}
                          checked={salaryConflictChoices[conflict.employee_code] === account}
                          onChange={() => setSalaryConflictChoices((current) => ({ ...current, [conflict.employee_code]: account }))}
                        />
                        <span>Dùng số trong file: <b>{account}</b></span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="salary-conflict-actions">
              <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => setSalaryConflictOpen(false)}>Hủy, giữ nguyên số cũ</button>
              <button
                type="button"
                disabled={Boolean(busy) || salaryConflicts.some((conflict) => !salaryConflictChoices[conflict.employee_code])}
                onClick={() => void applySalaryConflictChoices()}
              >
                {busy === 'salary-conflicts' ? 'Đang cập nhật...' : 'Xác nhận lựa chọn'}
              </button>
            </div>
          </section>
        </div>
      )}
      <div className="bank-hero">
        <div className="bank-hero-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18M12 3l9 5H3l9-5Z" /></svg>
        </div>
        <div>
          <p className="bank-eyebrow">Bảng lương ngân hàng</p>
          <h2>Chuẩn bị danh sách chuyển lương</h2>
          <p>Quét Output 2 chính thức, tự điền tài khoản đã lưu và xuất file Excel sẵn sàng gửi ngân hàng.</p>
        </div>
        <span className="bank-factory-pill">Xưởng {factory === 'factory2' ? 2 : 1}</span>
      </div>

      <div className="bank-command-card">
        <label
          className={`bank-file-picker${bankFileDragging ? ' is-dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setBankFileDragging(true) }}
          onDragEnter={(event) => { event.preventDefault(); setBankFileDragging(true) }}
          onDragLeave={() => setBankFileDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setBankFileDragging(false)
            setFile(event.dataTransfer.files?.[0] || null)
          }}
        >
          <input type="file" accept=".xlsx,.xlsm" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <span className="bank-file-mark">XLSX</span>
          <span><strong>{file?.name || 'Chọn bảng chính thức Output 2'}</strong><small>File có họ tên, mã nhân viên và tiền lương cuối</small></span>
        </label>
        <button type="button" disabled={!file || Boolean(busy)} onClick={scanFile}>{busy === 'scan' ? 'Đang quét...' : 'Quét bảng lương'}</button>
        <div className="bank-drive-actions">
          <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => syncDrive('backup')}>Sao lưu Drive</button>
          <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => syncDrive('restore')}>Khôi phục</button>
        </div>
      </div>
      <div className="bank-word-import">
        <div className="bank-word-copy">
          <strong>Nhập danh sách Excel lương cũ</strong>
          <span>Nhận mã nhân viên và số tài khoản từ bảng lương Excel cũ, rồi tự điền lại số đã có.</span>
        </div>
        <label
          className={`bank-word-picker${salaryFileDragging ? ' is-dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setSalaryFileDragging(true) }}
          onDragEnter={(event) => { event.preventDefault(); setSalaryFileDragging(true) }}
          onDragLeave={() => setSalaryFileDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setSalaryFileDragging(false)
            void selectSalaryFile(event.dataTransfer.files?.[0] || null)
          }}
        >
          <input type="file" accept=".xlsx,.xlsm" onChange={(event) => void selectSalaryFile(event.target.files?.[0] || null)} />
          <span>XLSX</span>
          <strong>{salaryFile?.name || 'Chọn hoặc kéo thả file Excel lương cũ'}</strong>
        </label>
        <label className="bank-period-field"><span>Tháng</span><input className="bank-period-input" type="number" min="1" max="12" value={salaryMonth} onChange={(event) => setSalaryMonth(event.target.value)} aria-label="Tháng Excel lương cũ" /></label>
        <label className="bank-period-field year"><span>Năm</span><input className="bank-period-input year" type="number" min="2000" value={salaryYear} onChange={(event) => setSalaryYear(event.target.value)} aria-label="Năm Excel lương cũ" /></label>
        <button type="button" className="secondary-button" disabled={!salaryFile || !salaryMonth || !salaryYear || Boolean(busy)} onClick={() => void importSalaryExcel()}>
          {busy === 'salary' ? 'Đang nhập Excel...' : 'Nhập Excel lương cũ'}
        </button>
      </div>

      <div className="bank-section-tabs bank-section-tabs-lowered" role="tablist" aria-label="Khu vực ngân hàng">
        <button type="button" role="tab" aria-selected={bankTab === 'transfer'} className={bankTab === 'transfer' ? 'active' : ''} onClick={() => setBankTab('transfer')}>
          Danh sách chuyển lương
        </button>
        <button type="button" role="tab" aria-selected={bankTab === 'accounts'} className={bankTab === 'accounts' ? 'active' : ''} onClick={() => { setAccountLoading(true); setBankTab('accounts') }}>
          Danh sách tài khoản
        </button>
      </div>

      {error && <AppToast kind="error" message={error} onClose={() => setError('')} />}
      {notice && <AppToast kind="success" message={notice} onClose={() => setNotice('')} />}

      {bankTab === 'transfer' && <>
      <div className="bank-metrics">
        <div><span>Nhân viên</span><strong>{rows.length}</strong></div>
        <div className={missing ? 'warning' : 'complete'}><span>Thiếu tài khoản</span><strong>{missing}</strong></div>
        <div><span>Tổng tiền lương</span><strong>{total.toLocaleString('vi-VN')} đ</strong></div>
        <div><span>Kỳ lương</span><strong>{scan?.month && scan?.year ? `${scan.month}/${scan.year}` : 'Chưa quét'}</strong></div>
      </div>

      <div className="bank-table-card">
        <div className="bank-table-heading">
          <div>
            <h3>Danh sách chuyển lương</h3>
            <p>Số tài khoản được ghi nhớ theo mã nhân viên và theo từng xưởng.</p>
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã hoặc họ tên..." />
        </div>
        {!rows.length ? (
          <div className="bank-empty-state">
            <strong>Chưa có dữ liệu để hiển thị</strong>
            <span>Chọn đúng bảng chính thức Output 2 ở phía trên rồi bấm “Quét bảng lương”.</span>
          </div>
        ) : (
          <div className="bank-table-scroll">
            <table className="bank-table">
              <thead><tr><th>STT</th><th>Mã nhân viên</th><th>Họ và tên</th><th>Số tài khoản</th><th>Tiền lương</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <tr key={row.employee_code} className={row.conflict_accounts?.length || row.conflict_codes?.length ? 'bank-conflict-row' : ''}>
                    <td>{index + 1}</td><td><strong>{row.employee_code}</strong></td><td>{row.name}</td>
                    <td>
                      <input inputMode="numeric" value={row.account_number} placeholder="Nhập số tài khoản" onChange={(event) => setRows((current) => current.map((item) => item.employee_code === row.employee_code ? { ...item, account_number: event.target.value.replace(/\D/g, ''), conflict_accounts: [], conflict_codes: [] } : item.conflict_codes?.length ? { ...item, conflict_codes: [] } : item))} />
                      {Boolean(row.conflict_accounts?.length) && (
                        <div className="bank-conflict-note">
                          <span>Mã này đang có {row.conflict_accounts?.length} số tài khoản. Xóa mã sai:</span>
                          <div>
                            {row.conflict_accounts?.map((account) => (
                              <button
                                type="button"
                                key={account}
                                onClick={() => setRows((current) => current.map((item) => {
                                  if (item.employee_code !== row.employee_code) return item
                                  const remaining = (item.conflict_accounts || []).filter((value) => value !== account)
                                  return {
                                    ...item,
                                    conflict_accounts: remaining.length > 1 ? remaining : [],
                                    account_number: remaining.length === 1 ? remaining[0] : remaining.includes(item.account_number) ? item.account_number : '',
                                  }
                                }))}
                                title={`Xóa số tài khoản ${account}`}
                              >
                                {account}<i>×</i>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {Boolean(row.conflict_codes?.length) && (
                        <div className="bank-conflict-note">
                          <span>Số tài khoản này đang trùng với mã: {row.conflict_codes?.join(', ')}. Hãy kiểm tra lại.</span>
                        </div>
                      )}
                    </td>
                    <td className="bank-money">{Number(row.salary).toLocaleString('vi-VN')} đ</td>
                    <td>
                      <span className={`bank-row-status${row.conflict_accounts?.length || row.conflict_codes?.length ? ' conflict' : isUnsavedAccount(row) ? ' draft' : row.account_number ? ' complete' : ''}`}>
                        {row.conflict_accounts?.length || row.conflict_codes?.length
                          ? 'Trùng tài khoản'
                          : isUnsavedAccount(row)
                            ? 'Vừa nhập'
                            : row.account_number
                              ? 'Đã lưu'
                              : 'Cần bổ sung'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="bank-table-footer">
          <span>{conflictCount ? `Có ${conflictCount} mã bị trùng hoặc có nhiều số tài khoản; hãy kiểm tra lại trước khi xuất.` : missing ? `Còn ${missing} nhân viên cần nhập số tài khoản trước khi xuất.` : rows.length ? 'Danh sách đã đủ thông tin để xuất.' : 'Dữ liệu được lưu trên máy; Drive dùng để sao lưu và khôi phục.'}</span>
          <div>
            <button type="button" className="secondary-button" disabled={!rows.length || Boolean(busy) || conflictCount > 0} onClick={save}>{busy === 'save' ? 'Đang lưu...' : 'Lưu số tài khoản'}</button>
            <button type="button" disabled={!scan || Boolean(busy) || missing > 0 || conflictCount > 0} onClick={() => setExportChoiceOpen(true)}>{busy === 'export' ? 'Đang tạo Excel...' : 'Xuất Excel ngân hàng'}</button>
          </div>
        </div>
      </div>
      </>}
      {bankTab === 'accounts' && (
        <BankAccountDirectory
          key={factory}
          overview={accountOverview}
          activeCodes={activeCodes}
          search={accountSearch}
          loading={accountLoading}
          onSearch={setAccountSearch}
          onSaveAccount={saveDirectoryAccount}
        />
      )}
    </section>
  )
}

function BankAccountDirectory({
  overview,
  activeCodes,
  search,
  loading,
  onSearch,
  onSaveAccount,
}: {
  overview: BankAccountOverview | null
  activeCodes: Set<string> | null
  search: string
  loading: boolean
  onSearch: (value: string) => void
  onSaveAccount: (row: BankAccountDirectoryRow, accountNumber: string) => Promise<void>
}) {
  const [draftAccounts, setDraftAccounts] = useState<Record<string, string>>({})
  const [savingCode, setSavingCode] = useState('')
  const keyword = search.trim().toLowerCase()
  const filteredRows = (overview?.accounts ?? []).filter((row) =>
    !keyword || row.employee_code.toLowerCase().includes(keyword) || row.name.toLowerCase().includes(keyword),
  )
  const rows = [...filteredRows].sort((left, right) => {
    if (!activeCodes) return Number(left.employee_code) - Number(right.employee_code)
    const rank = (row: BankAccountDirectoryRow) => {
      if (!activeCodes.has(row.employee_code)) return 2
      return row.account_number ? 1 : 0
    }
    return rank(left) - rank(right) || Number(left.employee_code) - Number(right.employee_code)
  })

  async function saveRow(row: BankAccountDirectoryRow) {
    setSavingCode(row.employee_code)
    try {
      await onSaveAccount(row, draftAccounts[row.employee_code] ?? '')
    } finally {
      setSavingCode('')
    }
  }

  return (
    <div className="bank-directory-card">
      <div className="bank-directory-heading">
        <div>
          <p className="bank-eyebrow">Kho tài khoản độc lập theo xưởng</p>
          <h3>Danh sách tài khoản ngân hàng</h3>
          <p>Trước khi quét, đây là kho mã và tài khoản đã lưu. Sau khi quét, mã thiếu tài khoản sẽ được đưa lên trước.</p>
        </div>
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Tìm mã hoặc họ tên..." aria-label="Tìm tài khoản ngân hàng" />
      </div>
      <div className="bank-directory-metrics">
        <span className="missing"><strong>{overview?.without_account ?? 0}</strong> chưa có tài khoản</span>
        <span className="complete"><strong>{overview?.with_account ?? 0}</strong> đã có tài khoản</span>
        <span><strong>{overview?.total ?? 0}</strong> nhân viên</span>
      </div>
      <div className="bank-directory-legend" aria-live="polite">
        {!activeCodes ? <span><i className="warehouse" /> Chưa quét: kho tài khoản nền trắng</span> : <>
          <span><i className="missing" /> Vàng: có làm tháng này, chưa có tài khoản</span>
          <span><i className="complete" /> Xanh: có làm và đã có tài khoản</span>
          <span><i className="inactive" /> Xám: không làm tháng này</span>
        </>}
      </div>
      {loading ? (
        <div className="bank-empty-state"><strong>Đang tải danh sách tài khoản...</strong><span>Đang đọc dữ liệu riêng của xưởng hiện tại.</span></div>
      ) : !rows.length ? (
        <div className="bank-empty-state"><strong>Chưa có nhân viên phù hợp</strong><span>Hãy lưu hồ sơ nhân viên trước hoặc nhập Word ở tab Danh sách chuyển lương.</span></div>
      ) : (
        <div className="bank-directory-table-wrap">
          <table className="bank-table bank-directory-table">
            <thead><tr><th>STT</th><th>Mã nhân viên</th><th>Họ và tên</th><th>Số tài khoản</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.employee_code}
                  className={`${row.conflict_codes?.length ? 'bank-conflict-row ' : ''}${activeCodes
                    ? activeCodes.has(row.employee_code)
                      ? row.account_number ? 'bank-directory-active-complete' : 'bank-directory-active-missing'
                      : 'bank-directory-inactive'
                    : 'bank-directory-warehouse'}`}
                >
                  <td>{index + 1}</td>
                  <td><strong>{row.employee_code}</strong></td>
                  <td>{row.name || 'Chưa có tên'}</td>
                  <td className="bank-directory-account bank-directory-edit-cell">
                    <input
                      inputMode="numeric"
                      value={draftAccounts[row.employee_code] ?? row.account_number}
                      placeholder="Chưa nhập"
                      onChange={(event) => setDraftAccounts((current) => ({ ...current, [row.employee_code]: event.target.value.replace(/\D/g, '') }))}
                      aria-label={`Số tài khoản mã ${row.employee_code}`}
                    />
                    <button
                      type="button"
                      className="bank-directory-save"
                      disabled={savingCode === row.employee_code || (draftAccounts[row.employee_code] ?? row.account_number) === row.account_number}
                      onClick={() => void saveRow(row)}
                    >
                      {savingCode === row.employee_code ? 'Đang lưu' : 'Lưu'}
                    </button>
                  </td>
                  <td>
                    <span className={`bank-row-status${row.conflict_codes?.length ? ' conflict' : activeCodes && !activeCodes.has(row.employee_code) ? ' inactive' : activeCodes && row.account_number ? ' complete' : ''}`}>
                      {row.conflict_codes?.length
                        ? `Trùng số với mã ${row.conflict_codes.join(', ')}`
                        : !activeCodes ? 'Trong kho' : !activeCodes.has(row.employee_code) ? 'Không làm tháng này' : row.account_number ? 'Có thể nhận lương' : 'Cần bổ sung'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ConfirmationDialog({ request, onResolve }: { request: ConfirmationRequest; onResolve: (confirmed: boolean) => void }) {
  return (
    <div className="app-confirm-backdrop" role="presentation" onMouseDown={() => onResolve(false)}>
      <section
        className={`app-confirm-dialog${request.tone === 'danger' ? ' danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
        aria-describedby="app-confirm-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="app-confirm-kicker">{request.kicker ?? 'XÁC NHẬN'}</p>
        <h2 id="app-confirm-title">{request.title}</h2>
        {request.message && <p id="app-confirm-message">{request.message}</p>}
        <div className="app-confirm-actions">
          <button type="button" className="secondary-button" onClick={() => onResolve(false)}>
            {request.cancelLabel ?? 'Hủy'}
          </button>
          <button type="button" className={request.tone === 'danger' ? 'danger-button' : 'primary-button'} onClick={() => onResolve(true)}>
            {request.confirmLabel ?? 'Tiếp tục'}
          </button>
        </div>
      </section>
    </div>
  )
}

function StartupLoadingView() {
  return (
    <main className="startup-screen" aria-busy="true" aria-live="polite">
      <div className="startup-glow startup-glow-one" aria-hidden="true" />
      <div className="startup-glow startup-glow-two" aria-hidden="true" />
      <section className="startup-card">
        <div className="startup-illustration" aria-hidden="true">
          <div className="startup-logo">
            <svg viewBox="0 0 24 24">
              <path d="M7 2v3M17 2v3M3.5 9h17M5.5 4h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
              <path d="m8 15 2.2 2.2L16.5 11" />
            </svg>
          </div>
          <div className="startup-sheet">
            <div className="startup-sheet-top"><i /><i /><i /></div>
            <div className="startup-sheet-row active"><span /><b /></div>
            <div className="startup-sheet-row"><span /><b /></div>
            <div className="startup-sheet-row"><span /><b /></div>
            <div className="startup-check">✓</div>
          </div>
          <span className="startup-float-dot dot-one" />
          <span className="startup-float-dot dot-two" />
        </div>
        <div className="startup-copy">
          <p className="startup-kicker"><i /> AttendanceSystem</p>
          <h1>Đang chuẩn bị không gian làm việc</h1>
          <p>Đang kết nối dữ liệu nhân viên và khôi phục phiên làm việc gần nhất.</p>
          <div className="startup-progress" aria-hidden="true"><i /></div>
          <div className="startup-status">
            <span className="startup-spinner" aria-hidden="true" />
            Vui lòng chờ trong giây lát…
          </div>
        </div>
      </section>
      <p className="startup-footnote">Quản lý chấm công • Bảng lương • Hồ sơ nhân viên</p>
    </main>
  )
}

function LoginView({
  form,
  loading,
  error,
  onFormChange,
  onLogin,
}: {
  form: LoginForm
  loading: boolean
  error: string | null
  onFormChange: (form: LoginForm) => void
  onLogin: () => void
}) {
  return (
    <main className="app-shell auth-shell">
      <section className="auth-card">
        <p className="eyebrow">AttendanceSystem</p>
        <h1>Đăng nhập</h1>
        <div className="auth-form">
          <Input
            label="Email"
            value={form.email}
            onChange={(value) => onFormChange({ ...form, email: value })}
          />
          <Input
            label="Mật khẩu"
            value={form.password}
            onChange={(value) => onFormChange({ ...form, password: value })}
            type="password"
          />
          {error && <div className="alert inline-alert">{error}</div>}
          <button type="button" disabled={loading || !form.email || !form.password} onClick={onLogin}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </div>
      </section>
    </main>
  )
}

function OwnerInboxView({
  submissions,
  loading,
  onRefresh,
  onProcess,
}: {
  submissions: CloudSubmission[]
  loading: boolean
  onRefresh: () => void
  onProcess: (periodId: string) => void
}) {
  return (
    <section className="panel content-wide">
      <div className="panel-heading">
        <div>
          <h2>Hòm thư bảng công</h2>
          <p>Những hồ sơ nhân viên đã gửi lên Supabase, chờ chủ duyệt.</p>
        </div>
        <button type="button" disabled={loading} onClick={onRefresh}>
          {loading ? 'Đang tải...' : 'Tải lại'}
        </button>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Tháng</th>
              <th>File / người gửi</th>
              <th>Sheet</th>
              <th>Nhân viên</th>
              <th>Cần rà</th>
              <th>Thời gian gửi</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((item) => (
              <tr key={item.id}>
                <td>{item.month.toString().padStart(2, '0')}/{item.year}</td>
                <td>{formatSubmissionSource(item.source_filename)}</td>
                <td>{item.sheet_name || '-'}</td>
                <td>{item.block_count}</td>
                <td>{item.manual_check_count}</td>
                <td>{formatDateTime(item.created_at)}</td>
                <td>
                  <button type="button" disabled={loading || !item.source_path} onClick={() => onProcess(item.id)}>
                    {item.source_path ? 'Xử lý ngay' : 'Cần gửi lại'}
                  </button>
                </td>
              </tr>
            ))}
            {!submissions.length && (
              <tr>
                <td colSpan={7}>Chưa có hồ sơ nào trong hòm thư.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CloudSettingsView({
  config,
  form,
  loading,
  onFormChange,
  onSave,
  onTest,
  onSyncAll,
  onBackup,
  onBackupExcelAll,
  onOpenFolder,
}: {
  config: CloudConfig | null
  form: CloudConfigForm
  loading: boolean
  onFormChange: (form: CloudConfigForm) => void
  onSave: () => void
  onTest: () => void
  onSyncAll: () => void
  onBackup: () => void
  onBackupExcelAll: () => void
  onOpenFolder: (kind: 'root' | 'excel' | 'zip' | 'last') => void
}) {
  return (
    <section className="cloud-layout">
      <div className="panel cloud-panel cloud-primary-panel">
        <div className="panel-heading">
          <div>
            <h2>Sao lưu dữ liệu</h2>
            <p>Google Drive là nơi lưu file chính; Supabase là tùy chọn nâng cao và đang được tắt mặc định.</p>
          </div>
          <span>{config?.drive_backup_enabled ? 'Drive sẵn sàng' : 'Cần cấu hình Drive'}</span>
        </div>

        <div className="backup-summary-grid">
          <div className="backup-card">
            <div className="backup-card-header">
              <div>
                <h3>Dữ liệu online</h3>
                <p>Giữ bản lịch sử trên Supabase để khôi phục khi đổi máy.</p>
              </div>
              <span className={config?.enabled && config?.configured ? 'status-pill active' : 'status-pill'}>
                {config?.enabled && config?.configured ? 'Đang bật' : 'Đang tắt'}
              </span>
            </div>
            <div className="backup-facts">
              <Metric label="Tự đồng bộ khi lưu" value={config?.sync_on_save ? 'Có' : 'Không'} />
              <Metric label="Lần kiểm tra" value={formatDateTimeShort(config?.last_test_at)} />
              <Metric label="Lần đồng bộ" value={formatDateTimeShort(config?.last_sync_at)} />
            </div>
          </div>

          <div className="backup-card">
            <div className="backup-card-header">
              <div>
                <h3>File Excel trên Drive</h3>
                <p>Tạo thư mục dễ mở gồm file gốc, Output 1 và Output 2.</p>
              </div>
              <span className={config?.drive_backup_enabled ? 'status-pill active' : 'status-pill'}>
                {config?.drive_backup_enabled ? 'Đang bật' : 'Đang tắt'}
              </span>
            </div>
            <div className="backup-facts">
              <Metric label="Tự sao lưu khi lưu/sửa/xóa" value={config?.backup_on_history_change ? 'Có' : 'Không'} />
              <Metric label="Lần sao lưu" value={formatDateTimeShort(config?.last_backup_at)} />
              <Metric label="Thư mục Drive" value={config?.drive_backup_dir ? 'Đã chọn' : '-'} />
            </div>
            <div className="cloud-actions">
              <button type="button" className="secondary-button" disabled={loading} onClick={() => onOpenFolder('root')}>
                Mở Drive chính
              </button>
              <button type="button" className="secondary-button" disabled={loading} onClick={() => onOpenFolder('excel')}>
                Mở Excel đã lưu
              </button>
              <button type="button" className="secondary-button subtle-button" disabled={loading || !config?.last_backup_path} onClick={() => onOpenFolder('last')}>
                Mở backup mới nhất
              </button>
            </div>
          </div>
        </div>

        {config?.last_error && <div className="alert inline-alert">{config.last_error}</div>}
        {config?.last_backup_error && <div className="alert inline-alert">{config.last_backup_error}</div>}

        <details className="advanced-settings">
          <summary>Thao tác kỹ thuật</summary>
          <div className="cloud-actions advanced-action-row">
            <button type="button" className="secondary-button" disabled={loading} onClick={onTest}>
              Kiểm tra kết nối
            </button>
            <button type="button" className="secondary-button" disabled={loading || !config?.configured} onClick={onSyncAll}>
              Đồng bộ dữ liệu local
            </button>
            <button type="button" className="secondary-button" disabled={loading} onClick={onBackupExcelAll}>
              Tạo bản Excel dễ đọc
            </button>
            <button type="button" className="secondary-button subtle-button" disabled={loading} onClick={onBackup}>
              Tạo zip kỹ thuật
            </button>
            <button type="button" className="secondary-button subtle-button" disabled={loading} onClick={() => onOpenFolder('zip')}>
              Mở thư mục zip
            </button>
          </div>
        </details>

        <details className="advanced-settings">
          <summary>Cài đặt nâng cao</summary>
          <div className="cloud-form">
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => onFormChange({ ...form, enabled: event.target.checked })}
              />
              <span>Bật sao lưu dữ liệu online</span>
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={form.sync_on_save}
                onChange={(event) => onFormChange({ ...form, sync_on_save: event.target.checked })}
              />
              <span>Tự đồng bộ khi lưu/sửa lịch sử</span>
            </label>
            <Input
              label="Supabase URL"
              value={form.supabase_url}
              onChange={(value) => onFormChange({ ...form, supabase_url: value })}
            />
            <Input
              label={config?.key_hint ? `Service role key (${config.key_hint})` : 'Service role key'}
              value={form.service_role_key}
              onChange={(value) => onFormChange({ ...form, service_role_key: value })}
              type="password"
            />
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={form.drive_backup_enabled}
                onChange={(event) => onFormChange({ ...form, drive_backup_enabled: event.target.checked })}
              />
              <span>Sao lưu Excel vào Google Drive</span>
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={form.backup_on_history_change}
                onChange={(event) => onFormChange({ ...form, backup_on_history_change: event.target.checked })}
              />
              <span>Tự sao lưu khi lưu/sửa/xóa</span>
            </label>
            <Input
              label="Thư mục Drive backup"
              value={form.drive_backup_dir}
              onChange={(value) => onFormChange({ ...form, drive_backup_dir: value })}
            />
          </div>
          <div className="cloud-actions">
            <button type="button" disabled={loading} onClick={onSave}>
              Lưu cấu hình
            </button>
          </div>
        </details>

        {config?.last_backup_path && <p className="panel-note">Backup mới nhất: {config.last_backup_path}</p>}
      </div>

      <div className="panel cloud-panel cloud-note-panel">
        <div className="panel-heading">
          <h2>Ghi chú</h2>
          <span>Phân biệt dữ liệu</span>
        </div>
        <p className="panel-note">
          Supabase vẫn được giữ như một tính năng tùy chọn. Khi đang tắt, app không gọi Supabase và không cần URL/key.
        </p>
        <p className="panel-note">
          Google Drive là nơi giữ các file Excel dễ mở lại: file gốc, Output 1 và Output 2. Thư mục zip kỹ thuật chỉ dùng khi cần khôi phục sâu.
        </p>
      </div>
    </section>
  )
}

function AttendanceView({
  data,
  reviewItems,
  onReviewItemsChange,
  showWorkDetail,
  showManualChecks,
  showEmployeeList,
  showNewcomerBenefitReview,
}: {
  data: AnalyzeResponse
  reviewItems: PayrollReviewItem[]
  onReviewItemsChange: (items: PayrollReviewItem[]) => void
  showWorkDetail: boolean
  showManualChecks: boolean
  showEmployeeList: boolean
  showNewcomerBenefitReview: boolean
}) {
  const [selectedCode, setSelectedCode] = useState(data.blocks[0]?.employee_code ?? '')
  const selectedBlock = data.blocks.find((block) => block.employee_code === selectedCode) ?? data.blocks[0]
  const firstWorkDays = firstWorkDaysByEmployee(data)

  return (
    <>
      <section className="summary-grid">
        <Metric label="Sheet" value={data.sheet_name} />
        <Metric label="Nhân viên" value={data.summary.blocks} />
        <Metric label="Ô công" value={data.summary.result_cells} />
        <Metric label="Quên bấm" value={data.summary.missing_cells} />
        <Metric label="Đi trễ" value={data.summary.late_cells} />
        <Metric label="Cần kiểm tra" value={data.summary.manual_check_count} />
      </section>

      <section className={`attendance-output-layout${showEmployeeList && showWorkDetail ? '' : ' attendance-output-compact'}`}>
        <nav className="payroll-tools">
          {showEmployeeList && <a href="#output1-employees">Mã NV</a>}
          {showWorkDetail && <a href="#output1-detail">Chi tiết</a>}
          <a href="#output1-review">Kiểm tra</a>
          {showManualChecks && <a href="#manual-checks">Thủ công</a>}
        </nav>

        {showEmployeeList && (
          <div className="panel employee-list" id="output1-employees">
            <div className="panel-heading">
              <h2>Nhân viên</h2>
              <span>{data.blocks.length} mã</span>
            </div>
            <div className="employee-buttons">
              {data.blocks.map((block) => (
                <button
                  type="button"
                  key={block.employee_code}
                  className={block.employee_code === selectedBlock?.employee_code ? 'active' : ''}
                  onClick={() => setSelectedCode(block.employee_code)}
                >
                  <span>{block.employee_code}</span>
                  <small>{formatNumber(totalBlockHours(block))} giờ</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {showWorkDetail && (
          <EmployeeWorkPanel
            id="output1-detail"
            title="Chi tiết công"
            employeeCode={selectedBlock?.employee_code ?? ''}
            rows={selectedBlock ? blockToWorkRows(selectedBlock, data.manual_checks) : []}
            totalHours={selectedBlock ? totalBlockHours(selectedBlock) : 0}
            workDays={selectedBlock ? totalBlockHours(selectedBlock) / 8 : 0}
          />
        )}

        <PayrollReviewPanel
          id="output1-review"
          title="Kiểm tra Output"
          items={reviewItems}
          firstWorkDays={firstWorkDays}
          showNewcomerBenefitReview={showNewcomerBenefitReview}
          onChange={onReviewItemsChange}
        />

        {showManualChecks && (
          <div className="panel manual-check-panel" id="manual-checks">
            <div className="panel-heading">
              <h2>Cần kiểm tra thủ công</h2>
              <span>{data.manual_checks.length} dòng</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mã NV</th>
                    <th>Ngày</th>
                    <th>Ô giờ</th>
                    <th>Giờ bấm</th>
                    <th>Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {data.manual_checks.slice(0, 18).map((item, index) => (
                    <tr key={`${item.employee_code}-${item.day}-${index}`}>
                      <td>{item.employee_code}</td>
                      <td>{item.day}</td>
                      <td>{item.cell}</td>
                      <td>{item.punches.join(', ')}</td>
                      <td>{item.messages.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  )
}

function EmployeeRegistryView({
  employees,
  attendanceData,
  attendanceOverview,
  filterYear,
  filterMonth,
  latestHistoryInfo,
  knownHistoryCodes,
  selectedCode,
  form,
  loading,
  cardExportLoading,
  onSelect,
  onCreate,
  onFilterYearChange,
  onFilterMonthChange,
  onFormChange,
  onSave,
  onRequestOutput2Export,
  onExportCards,
}: {
  employees: PayrollEmployee[]
  attendanceData: AnalyzeResponse | null
  attendanceOverview: AttendanceOverview | null
  filterYear: string
  filterMonth: string
  latestHistoryInfo: LatestHistoryInfo
  knownHistoryCodes: string[]
  selectedCode: string
  form: PayrollForm
  loading: boolean
  cardExportLoading: boolean
  onSelect: (code: string) => void
  onCreate: () => void
  onFilterYearChange: (year: string) => void
  onFilterMonthChange: (month: string) => void
  onFormChange: (form: PayrollForm) => void
  onSave: () => void
  onRequestOutput2Export: () => void
  onExportCards: () => void
}) {
  const [query, setQuery] = useState('')

  if (attendanceData) {
    return (
      <section className="payroll-layout employee-overview-only">
        <PayrollOverview
          employees={employees}
          attendanceData={attendanceData}
          attendanceOverview={attendanceOverview}
          filterYear={filterYear}
          filterMonth={filterMonth}
          latestHistoryInfo={latestHistoryInfo}
          knownHistoryCodes={knownHistoryCodes}
          selectedCode={selectedCode}
          form={form}
          loading={loading}
          cardExportLoading={cardExportLoading}
          overviewOnly
          onSelect={onSelect}
          onFilterYearChange={onFilterYearChange}
          onFilterMonthChange={onFilterMonthChange}
          onFormChange={onFormChange}
          onSave={onSave}
          onRequestOutput2Export={onRequestOutput2Export}
          onExportCards={onExportCards}
        />
      </section>
    )
  }

  const normalizedQuery = query.trim().toLowerCase()
  // Hồ sơ nhân viên là dữ liệu dùng chung. Khi tháng được chọn chưa có bản
  // chuyên cần, vẫn phải hiện các hồ sơ đã đồng bộ thay vì một danh sách rỗng.
  const monthEmployees = filterEmployeesByMonth(employees, attendanceOverview, filterYear, filterMonth, true)
  const filteredEmployees = sortEmployeesForEntry(monthEmployees).filter((employee) => {
    if (!normalizedQuery) return true
    return (
      employee.employee_code.toLowerCase().includes(normalizedQuery) ||
      (employee.name ?? '').toLowerCase().includes(normalizedQuery)
    )
  })
  const enteredCount = filteredEmployees.filter(isEmployeeProfileEntered).length
  const missingCount = filteredEmployees.length - enteredCount

  return (
    <section className="employee-registry-layout">
      <div className="panel employee-list">
        <div className="panel-heading">
          <h2>Danh sách nhân viên</h2>
          <div className="employee-registry-heading-meta">
            <span className="registry-sync-badge"><i />Đã đồng bộ {employees.length} hồ sơ</span>
            <span>{filteredEmployees.length} mã</span>
          </div>
        </div>
        <div className="employee-registry-toolbar">
          <EmployeeMonthControls
            overview={attendanceOverview}
            year={filterYear}
            month={filterMonth}
            onYearChange={onFilterYearChange}
            onMonthChange={onFilterMonthChange}
          />
          <Input label="Tìm mã / tên" value={query} onChange={setQuery} />
          <button type="button" className="secondary-button" onClick={onCreate}>
            Mã mới
          </button>
        </div>
        <EmployeeEntrySummary entered={enteredCount} missing={missingCount} />
        <div className="employee-buttons">
          {filteredEmployees.map((employee) => (
            <button
              type="button"
              key={employee.employee_code}
              className={[
                employee.employee_code === selectedCode ? 'active' : '',
                isEmployeeProfileEntered(employee) ? 'employee-status-complete' : 'employee-status-incomplete',
              ].join(' ')}
              onClick={() => onSelect(employee.employee_code)}
            >
              <span>{employee.employee_code}</span>
              <small>{employee.name || 'Chưa có tên'}</small>
            </button>
          ))}
          {!filteredEmployees.length && <p className="empty-note">Chưa có mã phù hợp.</p>}
        </div>
      </div>

      <div className="panel payroll-form employee-registry-form">
        <div className="panel-heading">
          <h2>Thông tin nhân viên theo xưởng</h2>
          <span>{form.employee_code || 'Mã mới'}</span>
        </div>
        <div className="form-grid">
          <Input label="Mã nhân viên" value={form.employee_code} onChange={(value) => onFormChange({ ...form, employee_code: value })} />
          <Input label="Tên nhân viên" value={form.name} onChange={(value) => onFormChange({ ...form, name: value })} />
          <Input label="Bắt đầu làm" value={form.start_work_note} onChange={(value) => onFormChange({ ...form, start_work_note: value })} />
          <Input label="Mức lương tháng" value={form.monthly_salary} onChange={(value) => onFormChange({ ...form, monthly_salary: value })} type="number" />
          <Input label="Lương 1 ngày công" value={calculatedDailySalaryValue(form)} onChange={() => undefined} type="number" readOnly />
          <Input label="Lương 1 giờ công" value={calculatedHourlySalaryValue(form)} onChange={() => undefined} type="number" readOnly />
          <label className="field field-wide">
            <span>Ghi chú hồ sơ</span>
            <textarea value={form.note} onChange={(event) => onFormChange({ ...form, note: event.target.value })} />
          </label>
        </div>
        <div className="payroll-actions">
          <button type="button" disabled={loading || !form.employee_code.trim()} onClick={onSave}>
            Lưu thông tin nhân viên
          </button>
        </div>
      </div>
    </section>
  )
}

function EmployeeMonthControls({
  overview,
  year,
  month,
  onYearChange,
  onMonthChange,
}: {
  overview: AttendanceOverview | null
  year: string
  month: string
  onYearChange: (year: string) => void
  onMonthChange: (month: string) => void
}) {
  const years = overview?.years ?? []
  const yearOptions = year && !years.includes(Number(year)) ? [Number(year), ...years] : years

  return (
    <div className="employee-month-controls">
      <label className="field">
        <span>Năm</span>
        <select value={year} onChange={(event) => onYearChange(event.target.value)}>
          {!yearOptions.length && <option value="">Chưa có dữ liệu</option>}
          {yearOptions.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Tháng</span>
        <select value={month} onChange={(event) => onMonthChange(event.target.value)}>
          <option value="">Tất cả</option>
          {Array.from({ length: 12 }, (_, index) => (
            <option key={index + 1} value={index + 1}>T{index + 1}</option>
          ))}
        </select>
      </label>
    </div>
  )
}

function EmployeeEntrySummary({ entered, missing }: { entered: number; missing: number }) {
  return (
    <div className="employee-entry-summary">
      <span><i className="legend-dot complete-dot" />Đã nhập {entered}</span>
      <span><i className="legend-dot incomplete-dot" />Chưa nhập {missing}</span>
    </div>
  )
}

function PayrollOverview({
  employees,
  attendanceData,
  attendanceOverview,
  filterYear,
  filterMonth,
  latestHistoryInfo,
  knownHistoryCodes,
  selectedCode,
  form,
  loading,
  cardExportLoading,
  overviewOnly = false,
  onSelect,
  onFilterYearChange,
  onFilterMonthChange,
  onFormChange,
  onSave,
  onRequestOutput2Export,
  onExportCards,
}: {
  employees: PayrollEmployee[]
  attendanceData: AnalyzeResponse
  attendanceOverview: AttendanceOverview | null
  filterYear: string
  filterMonth: string
  latestHistoryInfo: LatestHistoryInfo
  knownHistoryCodes: string[]
  selectedCode: string
  form: PayrollForm
  loading: boolean
  cardExportLoading: boolean
  overviewOnly?: boolean
  onSelect: (code: string) => void
  onFilterYearChange: (year: string) => void
  onFilterMonthChange: (month: string) => void
  onFormChange: (form: PayrollForm) => void
  onSave: () => void
  onRequestOutput2Export: () => void
  onExportCards: () => void
}) {
  const monthEmployees = filterEmployeesByMonth(
    employees,
    attendanceOverview,
    filterYear,
    filterMonth,
    isSamePeriod(filterYear, filterMonth, attendanceData.period),
  )
  const sortedEmployees = sortEmployeesForEntry(monthEmployees)
  const enteredCount = sortedEmployees.filter(isEmployeeProfileEntered).length
  const missingCount = sortedEmployees.length - enteredCount
  const latestCodeSet = new Set(latestHistoryInfo.employee_codes)
  const knownCodeSet = new Set(knownHistoryCodes)
  const isNewestPeriod = isAnalyzedPeriodNewest(attendanceData.period, latestHistoryInfo.period)
  const newEmployees = sortEmployeesByCode(
    employees.filter((employee) => isNewestPeriod && !latestCodeSet.has(employee.employee_code)),
  ).map((employee): NewEmployeeItem => ({
    ...employee,
    novelty: knownCodeSet.has(employee.employee_code) ? 'returning' : 'first-time',
  }))
  const selectedEmployee = employees.find((employee) => employee.employee_code === selectedCode)

  return (
    <>
      <nav className="payroll-tools">
        <a href="#payroll-info">Lương</a>
        <a href="#new-employees">Mới</a>
        {!overviewOnly && <a href="#payroll-review">Kiểm tra</a>}
        {!overviewOnly && <a href="#bonus-entry">Thưởng</a>}
        {!overviewOnly && <a href="#penalty-entry">Phạt</a>}
        {!overviewOnly && <a href="#note-entry">Ghi chú</a>}
      </nav>

      <div className="panel employee-list">
        <div className="panel-heading">
          <h2>Danh sách nhân viên</h2>
          <span>{sortedEmployees.length} mã</span>
        </div>
        <div className="employee-list-filters">
          <EmployeeMonthControls
            overview={attendanceOverview}
            year={filterYear}
            month={filterMonth}
            onYearChange={onFilterYearChange}
            onMonthChange={onFilterMonthChange}
          />
        </div>
        <div className="status-legend">
          <span><i className="legend-dot complete-dot" />Đã nhập tên</span>
          <span><i className="legend-dot incomplete-dot" />Chưa nhập tên</span>
        </div>
        <EmployeeEntrySummary entered={enteredCount} missing={missingCount} />
        <div className="employee-buttons">
          {sortedEmployees.map((employee) => (
            <button
              type="button"
              key={employee.employee_code}
              className={[
                employee.employee_code === selectedCode ? 'active' : '',
                isEmployeeProfileEntered(employee) ? 'employee-status-complete' : 'employee-status-incomplete',
              ].join(' ')}
              onClick={() => onSelect(employee.employee_code)}
            >
              <span>{employee.employee_code}</span>
              <small>{formatNumber(employee.total_hours)} giờ</small>
            </button>
          ))}
        </div>
      </div>

      <div className="panel payroll-form" id="payroll-info">
        <div className="panel-heading">
          <h2>Thông tin lương</h2>
          <span>{selectedCode || 'Chưa chọn'}</span>
        </div>
        <div className="form-grid payroll-new-form-grid" aria-label="Thông tin theo các cột khung Output 2 mới">
          <Input label="Tên nhân viên" value={form.name} onChange={(value) => onFormChange({ ...form, name: value })} />
          <Input label="Bắt đầu làm" value={form.start_work_note} onChange={(value) => onFormChange({ ...form, start_work_note: value })} />
          <Input label="Mức lương tháng" value={form.monthly_salary} onChange={(value) => onFormChange({ ...form, monthly_salary: value })} type="number" />
          <Input label="Lương 1 ngày công" value={calculatedDailySalaryValue(form)} onChange={() => undefined} type="number" readOnly />
          <Input label="Lương 1 giờ công" value={calculatedHourlySalaryValue(form)} onChange={() => undefined} type="number" readOnly />
          <Input label="Số ngày đi làm" value={formatEditableNumber(selectedEmployee?.work_days)} onChange={() => undefined} type="number" readOnly />
          <Input label="Giờ làm thêm" value={formatEditableNumber(selectedEmployee?.overtime_hours)} onChange={() => undefined} type="number" readOnly />
          <Input label="Thưởng" value={form.bonus} onChange={(value) => onFormChange({ ...form, bonus: value })} type="number" />
          <Input label="Phạt NQ" value={formatEditableNumber(selectedEmployee?.nq_penalty)} onChange={() => undefined} type="number" readOnly />
          <Input label="Ứng lương" value={form.advance_or_penalty} onChange={(value) => onFormChange({ ...form, advance_or_penalty: value })} type="number" />
          <Input label={`Lương tháng ${attendanceData.period.year || ''}`} value={calculatedFrameFinalSalaryValue(form, selectedEmployee)} onChange={() => undefined} type="number" readOnly />
          <label className="field field-wide payroll-note-field">
            <span>Ghi chú</span>
            <textarea value={form.note} onChange={(event) => onFormChange({ ...form, note: event.target.value })} />
          </label>
        </div>
        <div className="payroll-actions">
          <button type="button" disabled={!selectedCode || loading} onClick={onSave}>Lưu thông tin lương</button>
          <button type="button" disabled={loading} onClick={onRequestOutput2Export}>Xuất Output 2</button>
          <button type="button" disabled={loading || cardExportLoading} onClick={onExportCards}>
            {cardExportLoading && <span className="button-spinner" aria-hidden="true" />}
            {cardExportLoading ? 'Đang xuất ảnh...' : 'Xuất ảnh bảng công NV'}
          </button>
        </div>
      </div>

      <NewEmployeesPanel
        employees={newEmployees}
        latestPeriodLabel={latestHistoryInfo.period?.label ?? ''}
        selectedCode={selectedCode}
        onSelect={onSelect}
      />
    </>
  )
}

function PayrollView({
  employees,
  attendanceData,
  attendanceOverview,
  filterYear,
  filterMonth,
  reviewItems,
  showNewcomerBenefitReview,
  latestHistoryInfo,
  knownHistoryCodes,
  selectedCode,
  form,
  loading,
  cardExportLoading,
  manualEntryLocked,
  onSelect,
  onFilterYearChange,
  onFilterMonthChange,
  onFormChange,
  onReviewItemsChange,
  onSavePatches,
  onSave,
  onManualEntryBlocked,
  onRequestOutput2Export,
  onExportCards,
}: {
  employees: PayrollEmployee[]
  attendanceData: AnalyzeResponse
  attendanceOverview: AttendanceOverview | null
  filterYear: string
  filterMonth: string
  reviewItems: PayrollReviewItem[]
  showNewcomerBenefitReview: boolean
  latestHistoryInfo: LatestHistoryInfo
  knownHistoryCodes: string[]
  selectedCode: string
  form: PayrollForm
  loading: boolean
  cardExportLoading: boolean
  manualEntryLocked: boolean
  onSelect: (code: string) => void
  onFilterYearChange: (year: string) => void
  onFilterMonthChange: (month: string) => void
  onFormChange: (form: PayrollForm) => void
  onReviewItemsChange: (items: PayrollReviewItem[]) => void
  onSavePatches: (updates: PayrollPatchUpdate[]) => Promise<void>
  onSave: () => void
  onManualEntryBlocked: () => void
  onRequestOutput2Export: () => void
  onExportCards: () => void
}) {
  const monthEmployees = filterEmployeesByMonth(
    employees,
    attendanceOverview,
    filterYear,
    filterMonth,
    isSamePeriod(filterYear, filterMonth, attendanceData.period),
  )
  const sortedEmployees = sortEmployeesForEntry(monthEmployees)
  const firstWorkDays = firstWorkDaysByEmployee(attendanceData)

  return (
    <section className="payroll-layout">
      <PayrollOverview
        employees={employees}
        attendanceData={attendanceData}
        attendanceOverview={attendanceOverview}
        filterYear={filterYear}
        filterMonth={filterMonth}
        latestHistoryInfo={latestHistoryInfo}
        knownHistoryCodes={knownHistoryCodes}
        selectedCode={selectedCode}
        form={form}
        loading={loading}
        cardExportLoading={cardExportLoading}
        onSelect={onSelect}
        onFilterYearChange={onFilterYearChange}
        onFilterMonthChange={onFilterMonthChange}
        onFormChange={onFormChange}
        onSave={onSave}
        onRequestOutput2Export={onRequestOutput2Export}
        onExportCards={onExportCards}
      />

      <PayrollReviewPanel
        items={reviewItems}
        firstWorkDays={firstWorkDays}
        showNewcomerBenefitReview={showNewcomerBenefitReview}
        onChange={onReviewItemsChange}
      />

      <BulkPayrollSection
        id="bonus-entry"
        title="Nhập thưởng"
        field="bonus"
        employees={sortedEmployees}
        loading={loading}
        manualEntryLocked={manualEntryLocked}
        onManualEntryBlocked={onManualEntryBlocked}
        onApply={onSavePatches}
      />
      <BulkPayrollSection
        id="penalty-entry"
        title="Nhập ứng lương + phạt"
        field="advance_or_penalty"
        employees={sortedEmployees}
        loading={loading}
        manualEntryLocked={manualEntryLocked}
        onManualEntryBlocked={onManualEntryBlocked}
        onApply={onSavePatches}
      />
      <BulkPayrollSection
        id="note-entry"
        title="Nhập ghi chú"
        field="note"
        employees={sortedEmployees}
        loading={loading}
        manualEntryLocked={manualEntryLocked}
        onManualEntryBlocked={onManualEntryBlocked}
        onApply={onSavePatches}
      />
    </section>
  )
}

function reviewPairKey(item: Pick<PayrollReviewItem, 'employee_code' | 'day'>) {
  return `${item.employee_code}:${item.day}`
}

function firstWorkDaysByEmployee(data: AnalyzeResponse): Record<string, number> {
  return data.blocks.reduce<Record<string, number>>((days, block) => {
    const firstDay = block.results.reduce<number | null>((minimum, result) => {
      if (!result.punches.length) return minimum
      return minimum === null ? result.day : Math.min(minimum, result.day)
    }, null)
    if (firstDay !== null) days[block.employee_code] = firstDay
    return days
  }, {})
}

function PayrollReviewPanel({
  id = 'payroll-review',
  title = 'Kiểm tra Output',
  items,
  firstWorkDays,
  showNewcomerBenefitReview,
  onChange,
}: {
  id?: string
  title?: string
  items: PayrollReviewItem[]
  firstWorkDays: Record<string, number>
  showNewcomerBenefitReview: boolean
  onChange: (items: PayrollReviewItem[]) => void
}) {
  const [viewMode, setViewMode] = useState<'pending' | 'history' | 'all'>('pending')
  const displayedItems = items.filter((item) => showNewcomerBenefitReview || item.type !== 'newcomer_benefit')
  const pendingCount = displayedItems.filter((item) => item.status === 'pending').length
  const historyAppliedCount = displayedItems.filter((item) => item.origin === 'history-applied').length
  const ruleChangedCount = displayedItems.filter((item) => item.type === 'rule_change').length
  const newcomerReviewCount = displayedItems.filter((item) => item.novelty).length
  const newcomerBenefitCount = displayedItems.filter((item) => item.type === 'newcomer_benefit').length
  const reviewTypesByKey = displayedItems.reduce<Record<string, Set<'missing' | 'late'>>>((acc, item) => {
    if (item.type !== 'missing' && item.type !== 'late') return acc
    const key = reviewPairKey(item)
    acc[key] ??= new Set()
    acc[key].add(item.type)
    return acc
  }, {})
  const pairedReviewOrder = displayedItems.reduce<string[]>((order, item) => {
    const key = reviewPairKey(item)
    const isPaired = reviewTypesByKey[key]?.has('missing') && reviewTypesByKey[key]?.has('late')
    if (isPaired && !order.includes(key)) order.push(key)
    return order
  }, [])
  const pairedReviewKeys = new Set(pairedReviewOrder)
  const pairedReviewRanks = new Map(pairedReviewOrder.map((key, index) => [key, index]))
  const pendingPairKeys = new Set(
    displayedItems
      .filter((item) => item.status === 'pending' && pairedReviewKeys.has(reviewPairKey(item)))
      .map((item) => reviewPairKey(item)),
  )
  const visibleItems =
    viewMode === 'pending'
      ? displayedItems.filter((item) => item.status === 'pending' || pendingPairKeys.has(reviewPairKey(item)))
      : viewMode === 'history'
        ? displayedItems.filter((item) => item.origin === 'history-applied')
        : displayedItems
  const sortReviewItems = (source: PayrollReviewItem[]) =>
    source
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        const leftRank = pairedReviewRanks.get(reviewPairKey(left.item)) ?? Number.MAX_SAFE_INTEGER
        const rightRank = pairedReviewRanks.get(reviewPairKey(right.item)) ?? Number.MAX_SAFE_INTEGER
        return leftRank - rightRank || left.index - right.index
      })
      .map(({ item }) => item)
  const missingItems = sortReviewItems(visibleItems.filter((item) => item.type === 'missing'))
  const lateItems = sortReviewItems(visibleItems.filter((item) => item.type === 'late'))
  const ruleChangeItems = visibleItems.filter((item) => item.type === 'rule_change')
  const newcomerBenefitItems = visibleItems.filter((item) => item.type === 'newcomer_benefit')
  const pairedStatuses = displayedItems.reduce<Record<string, Partial<Record<'missing' | 'late', PayrollReviewStatus>>>>((statuses, item) => {
    const key = reviewPairKey(item)
    if (!pairedReviewKeys.has(key) || (item.type !== 'missing' && item.type !== 'late')) return statuses
    statuses[key] ??= {}
    statuses[key][item.type] = item.status
    return statuses
  }, {})
  const isSectionComplete = (type: PayrollReviewType) => {
    const sectionItems = displayedItems.filter((item) => item.type === type)
    return viewMode === 'pending' && sectionItems.length > 0 && sectionItems.every((item) => item.status !== 'pending')
  }

  useEffect(() => {
    const legacySelectedKeys = new Set(
      items.filter((item) => item.pair_selected).map((item) => reviewPairKey(item)),
    )
    if (!legacySelectedKeys.size) return
    onChange(
      items.map((item) =>
        legacySelectedKeys.has(reviewPairKey(item))
          ? { ...item, status: 'pending', pair_selected: false }
          : item,
      ),
    )
  }, [items, onChange])

  function confirmItem(id: string) {
    const selectedItem = items.find((candidate) => candidate.id === id)
    if (!selectedItem) return
    const selectedKey = reviewPairKey(selectedItem)
    onChange(
      items.map((item) => {
        const isSelected = item.id === id
        const isPairedReview = pairedReviewKeys.has(selectedKey) && reviewPairKey(item) === selectedKey
        if (!isSelected && !isPairedReview) return item
        return {
          ...item,
          ...(!isSelected && isPairedReview ? { work_value: selectedItem.work_value } : {}),
          status: isSelected ? (hasReviewDraftChanges(item) ? 'edited' : 'ok') : item.status,
          pair_selected: false,
        }
      }),
    )
  }

  function editItem(id: string) {
    const selectedItem = items.find((candidate) => candidate.id === id)
    const selectedKey = selectedItem ? reviewPairKey(selectedItem) : ''
    const reopenPairedReview = Boolean(selectedItem && pairedReviewKeys.has(selectedKey))
    onChange(
      items.map((item) => {
        const isSelected = item.id === id
        const isPairedReview = reopenPairedReview && reviewPairKey(item) === selectedKey
        if (!isSelected && !isPairedReview) return item
        return { ...item, status: 'pending', pair_selected: false }
      }),
    )
  }

  function updateItem(id: string, patch: Partial<Pick<PayrollReviewItem, 'value' | 'work_value'>>) {
    const selectedItem = items.find((candidate) => candidate.id === id)
    const selectedKey = selectedItem ? reviewPairKey(selectedItem) : ''
    const isPairedUpdate = Boolean(selectedItem && pairedReviewKeys.has(selectedKey))
    const syncWorkValue = isPairedUpdate && Object.prototype.hasOwnProperty.call(patch, 'work_value')
    onChange(
      items.map((item) => {
        const isSelected = item.id === id
        const isPairedReview = isPairedUpdate && reviewPairKey(item) === selectedKey
        if (!isSelected && !isPairedReview) return item
        return {
          ...item,
          ...(isSelected ? patch : {}),
          ...(syncWorkValue && !isSelected ? { work_value: patch.work_value ?? item.work_value } : {}),
          status: isSelected || syncWorkValue ? 'pending' : item.status,
          pair_selected: false,
        }
      }),
    )
  }

  if (!items.length) {
    return (
      <div className="panel payroll-review" id={id}>
        <div className="panel-heading">
          <h2>{title}</h2>
          <span>Không có nghi vấn</span>
        </div>
        <p className="empty-note">Không phát hiện người đi trễ, quên bấm hoặc dữ liệu chưa rõ.</p>
      </div>
    )
  }

  return (
    <div className="panel payroll-review" id={id}>
      <div className="panel-heading">
        <h2>{title}</h2>
        <span>{pendingCount} chưa xác nhận</span>
      </div>
      <div className="bulk-status-strip review-status-strip">
        <button type="button" className={viewMode === 'pending' ? 'active' : ''} onClick={() => setViewMode('pending')}>
          Cần xác nhận {pendingCount}
        </button>
        <button type="button" className={viewMode === 'history' ? 'active' : ''} onClick={() => setViewMode('history')}>
          Đã áp dụng từ lịch sử {historyAppliedCount}
        </button>
        <button type="button" className={viewMode === 'all' ? 'active' : ''} onClick={() => setViewMode('all')}>
          Tất cả {displayedItems.length}
        </button>
      </div>
      {ruleChangedCount > 0 && (
        <div className="panel-note review-priority-note">
          <span>Có {ruleChangedCount} dòng đổi công so với lịch sử do rule mới; cần xác nhận trước khi lưu.</span>
        </div>
      )}
      {newcomerReviewCount > 0 && (
        <div className="panel-note review-priority-note">
          <span><i className="legend-dot first-time-dot" />Dòng vàng là mã mới lần đầu hoặc quay lại, nên kiểm tra kỹ.</span>
        </div>
      )}
      {newcomerBenefitCount > 0 && (
        <div className="panel-note review-priority-note">
          <span>Có {newcomerBenefitCount} ca được tự cộng công theo diện nhân viên mới; hãy xác nhận hoặc sửa công trước khi lưu.</span>
        </div>
      )}
      {pairedReviewKeys.size > 0 && (
        <div className="panel-note review-pair-note">
          <span><i className="review-pair-dot" />Có {pairedReviewKeys.size} cặp cần duyệt hai bên (trễ + chưa rõ). OK một bên sẽ đồng bộ Công và đánh dấu bên còn lại cần kiểm tra tiếp; cặp chỉ hoàn tất sau khi cả hai bên đều OK.</span>
        </div>
      )}
      <div className="review-grid">
        <ReviewTable
          title="Quên bấm / chưa rõ"
          valueLabel="Ghi chú"
          items={missingItems}
          pairedReviewKeys={pairedReviewKeys}
          pairedStatuses={pairedStatuses}
          firstWorkDays={firstWorkDays}
          onConfirm={confirmItem}
          onEdit={editItem}
          onUpdate={updateItem}
          completed={isSectionComplete('missing')}
        />
        <ReviewTable
          title="Đi trễ"
          valueLabel="Phút trễ"
          items={lateItems}
          pairedReviewKeys={pairedReviewKeys}
          pairedStatuses={pairedStatuses}
          firstWorkDays={firstWorkDays}
          onConfirm={confirmItem}
          onEdit={editItem}
          onUpdate={updateItem}
          completed={isSectionComplete('late')}
        />
        <ReviewTable
          title="Ca tự cộng nhân viên mới"
          valueLabel="Tự động cộng"
          items={newcomerBenefitItems}
          pairedReviewKeys={pairedReviewKeys}
          pairedStatuses={pairedStatuses}
          firstWorkDays={firstWorkDays}
          onConfirm={confirmItem}
          onEdit={editItem}
          onUpdate={updateItem}
          completed={isSectionComplete('newcomer_benefit')}
          layoutClassName="review-table-newcomer"
        />
        <ReviewTable
          title="Đổi công do rule"
          valueLabel="Công cũ"
          items={ruleChangeItems}
          pairedReviewKeys={pairedReviewKeys}
          pairedStatuses={pairedStatuses}
          firstWorkDays={firstWorkDays}
          onConfirm={confirmItem}
          onEdit={editItem}
          onUpdate={updateItem}
          completed={isSectionComplete('rule_change')}
          layoutClassName="review-table-rule"
        />
      </div>
    </div>
  )
}

function NewEmployeesPanel({
  employees,
  latestPeriodLabel,
  selectedCode,
  onSelect,
}: {
  employees: NewEmployeeItem[]
  latestPeriodLabel: string
  selectedCode: string
  onSelect: (code: string) => void
}) {
  const firstTimeCount = employees.filter((employee) => employee.novelty === 'first-time').length
  const returningCount = employees.length - firstTimeCount

  return (
    <div className="panel new-employees-panel" id="new-employees">
      <div className="panel-heading">
        <h2>Có thể mới / quay lại</h2>
        <span>{employees.length} mã</span>
      </div>
      <div className="panel-note novelty-note">
        <div className="novelty-legend" aria-label="Phân loại mã nhân viên">
          <span><i className="legend-dot first-time-dot" />Mới lần đầu: {firstTimeCount}</span>
          <span><i className="legend-dot returning-dot" />Quay lại: {returningCount}</span>
        </div>
        <p>
          Mã không có trong kỳ lưu gần nhất{latestPeriodLabel ? ` (${latestPeriodLabel})` : ''}; màu vàng là chưa từng có trong lịch sử, màu xám là từng có trước đây.
        </p>
      </div>
      <div className="employee-buttons compact-employee-buttons novelty-buttons">
        {employees.map((employee) => (
          <button
            type="button"
            key={employee.employee_code}
            className={[
              employee.employee_code === selectedCode ? 'active' : '',
              employee.novelty === 'first-time' ? 'employee-status-first-time' : 'employee-status-returning',
            ].join(' ')}
            onClick={() => onSelect(employee.employee_code)}
          >
            <span>{employee.employee_code}</span>
            <small>{formatNumber(employee.total_hours)} giờ</small>
          </button>
        ))}
        {!employees.length && <p className="empty-note">Không có mã khác so với kỳ lưu gần nhất.</p>}
      </div>
    </div>
  )
}

function BulkPayrollSection({
  id,
  title,
  field,
  employees,
  loading,
  manualEntryLocked,
  onManualEntryBlocked,
  onApply,
}: {
  id: string
  title: string
  field: BulkPayrollField
  employees: PayrollEmployee[]
  loading: boolean
  manualEntryLocked: boolean
  onManualEntryBlocked: () => void
  onApply: (updates: PayrollPatchUpdate[]) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [locked, setLocked] = useState(false)
  const [viewMode, setViewMode] = useState<'all' | 'pending' | 'empty'>('all')
  const inputLabel = field === 'bonus' ? 'Thưởng' : field === 'advance_or_penalty' ? 'Ứng/phạt' : 'Ghi chú'
  const emptyLabel = field === 'note' ? 'Chưa ghi chú' : field === 'bonus' ? 'Chưa nhập thưởng' : 'Chưa nhập phạt'
  const pendingLabel = field === 'advance_or_penalty' ? 'Chờ áp dụng phạt' : 'Chờ áp dụng'

  useEffect(() => {
    // Keep user edits while synchronizing newly loaded employee rows.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts((current) => {
      const next: Record<string, string> = {}
      for (const employee of employees) {
        next[employee.employee_code] = current[employee.employee_code] ?? payrollFieldValue(employee, field)
      }
      return next
    })
  }, [employees, field])

  const rows = employees.map((employee) => {
    const currentValue = payrollFieldValue(employee, field)
    const draftValue = drafts[employee.employee_code] ?? currentValue
    return {
      employee,
      currentValue,
      draftValue,
      isDirty: draftValue !== currentValue,
      isEmpty: isEmptyPayrollFieldValue(draftValue, field),
    }
  })
  const pendingRows = rows.filter((row) => row.isDirty)
  const emptyRows = rows.filter((row) => row.isEmpty)
  const filteredRows = rows.filter((row) => {
    const matchesQuery = row.employee.employee_code.includes(query.trim())
    if (!matchesQuery) return false
    if (viewMode === 'pending') return row.isDirty
    if (viewMode === 'empty') return row.isEmpty
    return true
  })

  function updateDraft(employeeCode: string, value: string) {
    if (manualEntryLocked) {
      onManualEntryBlocked()
      return
    }
    setLocked(false)
    setDrafts((current) => ({ ...current, [employeeCode]: value }))
  }

  async function applyChanges() {
    if (!pendingRows.length) {
      setLocked(true)
      return
    }
    await onApply(
      pendingRows.map((row) => ({
        employeeCode: row.employee.employee_code,
        patch: { [field]: row.draftValue },
      })),
    )
    setLocked(true)
  }

  return (
    <div className="panel bulk-payroll-section" id={id}>
      <div className="panel-heading">
        <h2>{title}</h2>
        <span>{pendingRows.length} chưa áp dụng</span>
      </div>
      <div className="bulk-toolbar bulk-toolbar-wide">
        <Input label="Tìm mã nhân viên" value={query} onChange={setQuery} />
        <div className="bulk-status-strip">
          <button type="button" className={viewMode === 'all' ? 'active' : ''} onClick={() => setViewMode('all')}>
            Tất cả {rows.length}
          </button>
          <button type="button" className={viewMode === 'pending' ? 'active' : ''} onClick={() => setViewMode('pending')}>
            {pendingLabel} {pendingRows.length}
          </button>
          <button type="button" className={viewMode === 'empty' ? 'active' : ''} onClick={() => setViewMode('empty')}>
            {emptyLabel} {emptyRows.length}
          </button>
        </div>
        <div className="bulk-confirm-actions">
          <button type="button" disabled={loading || locked || !pendingRows.length} onClick={applyChanges}>
            OK áp dụng
          </button>
          <button type="button" disabled={loading || !locked} onClick={() => setLocked(false)}>
            Sửa
          </button>
        </div>
      </div>
      <div className={field === 'advance_or_penalty' ? 'bulk-entry-layout with-review' : 'bulk-entry-layout'}>
        <div className="table-wrap bulk-table">
          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên</th>
                <th>Tổng giờ</th>
                {field === 'note' && <th>Số Ngày Đi Làm</th>}
                <th>{inputLabel}</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.employee.employee_code} className={row.isDirty ? 'warning-row' : locked ? 'selected-row' : ''}>
                  <td>{row.employee.employee_code}</td>
                  <td>{row.employee.name}</td>
                  <td>{formatNumber(row.employee.total_hours)}</td>
                  {field === 'note' && <td>{formatNumber(row.employee.work_days)}</td>}
                  <td>
                    {field === 'note' ? (
                      <textarea
                        className="bulk-note-input"
                        value={row.draftValue}
                        disabled={locked || loading}
                        onChange={(event) => updateDraft(row.employee.employee_code, event.target.value)}
                      />
                    ) : (
                      <input
                        className="table-input"
                        type="number"
                        value={row.draftValue}
                        disabled={locked || loading}
                        onChange={(event) => updateDraft(row.employee.employee_code, event.target.value)}
                      />
                    )}
                  </td>
                  <td>{row.isDirty ? 'Chờ OK' : locked ? 'Đã áp dụng' : 'Chưa đổi'}</td>
                </tr>
              ))}
              {!filteredRows.length && (
                <tr>
                  <td colSpan={field === 'note' ? 6 : 5}>Không có dữ liệu</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {field === 'advance_or_penalty' && (
          <div className="penalty-pending-panel">
            <div className="review-title">
              <strong>Phạt chờ áp dụng</strong>
              <span>{pendingRows.length} mã</span>
            </div>
            <div className="penalty-pending-list">
              {pendingRows.map((row) => (
                <div className="penalty-pending-item" key={row.employee.employee_code}>
                  <div>
                    <strong>{row.employee.employee_code}</strong>
                    <span>{row.employee.name || 'Chưa có tên'}</span>
                  </div>
                  <b>{formatMoney(Number(row.draftValue || 0))}</b>
                </div>
              ))}
              {!pendingRows.length && <p className="empty-note">Chưa có mã phạt chờ áp dụng.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewTable({
  title,
  valueLabel,
  items,
  pairedReviewKeys,
  pairedStatuses = {},
  firstWorkDays,
  onConfirm,
  onEdit,
  onUpdate,
  completed = false,
  layoutClassName = '',
}: {
  title: string
  valueLabel: string
  items: PayrollReviewItem[]
  pairedReviewKeys: Set<string>
  pairedStatuses: Record<string, Partial<Record<'missing' | 'late', PayrollReviewStatus>>>
  firstWorkDays: Record<string, number>
  onConfirm: (id: string) => void
  onEdit: (id: string) => void
  onUpdate: (id: string, patch: Partial<Pick<PayrollReviewItem, 'value' | 'work_value'>>) => void
  completed?: boolean
  layoutClassName?: string
}) {
  if (!items.length && !completed) return null

  return (
    <div className={`review-table ${layoutClassName}`.trim()}>
      <div className="review-title">
        <strong>{title}</strong>
        <span>{completed ? 'Đã xong' : `${items.length} dòng`}</span>
      </div>
      {completed ? (
        <div className="review-complete-state" role="status">
          <span className="review-complete-icon" aria-hidden="true">✓</span>
          <div>
            <strong>Đã kiểm tra xong</strong>
            <span>Tất cả dòng trong mục này đã được xác nhận.</span>
          </div>
        </div>
      ) : <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mã</th>
              <th>Ngày</th>
              <th>Giờ bấm</th>
              <th>{valueLabel}</th>
              <th>Công</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const pairKey = reviewPairKey(item)
              const isPairedReview = pairedReviewKeys.has(pairKey)
              const isFirstWorkDayReview = item.status === 'pending' && item.novelty === 'first-time' && (item.type === 'missing' || item.type === 'late') && firstWorkDays[item.employee_code] === item.day
              const peerType = item.type === 'missing' ? 'late' : 'missing'
              const currentReviewed = item.status !== 'pending'
              const peerReviewed = isPairedReview && pairedStatuses[pairKey]?.[peerType] !== 'pending'
              const needsPairCheck = isPairedReview && item.status === 'pending' && peerReviewed
              return (
              <tr
                key={item.id}
                className={[
                  item.status === 'pending' ? 'warning-row' : 'selected-row',
                  item.novelty ? 'review-newcomer-row' : '',
                  isPairedReview ? 'review-paired-row' : '',
                  currentReviewed ? 'review-pair-checked' : '',
                  needsPairCheck ? 'review-pair-next' : '',
                ].join(' ')}
                title={isPairedReview ? 'Cặp trùng công: dòng trễ và dòng chưa rõ được xếp song song để kiểm tra.' : undefined}
              >
                <td className={isFirstWorkDayReview ? 'review-employee-cell has-first-day-mark' : 'review-employee-cell'}>
                  <span>{item.employee_code}</span>
                  {isFirstWorkDayReview && (
                    <span
                      className="review-first-day-mark"
                      title="Mã mới · đây là ngày đầu tiên có dữ liệu trong tháng · nên kiểm tra/chấm tay"
                      aria-label="Mã mới, ngày đầu tiên có dữ liệu trong tháng"
                      tabIndex={0}
                    />
                  )}
                </td>
                <td>
                  <span className="review-day-value">{item.day}</span>
                </td>
                <td>
                  <span className="review-punch-list">
                    {item.punches.map((punch) => <span key={punch}>{punch}</span>)}
                  </span>
                </td>
                <td>
                  <input
                    className={`table-input${item.type === 'newcomer_benefit' ? ' newcomer-benefit-input' : ''}`}
                    value={item.value}
                    placeholder="Xóa"
                    disabled={currentReviewed || item.type === 'newcomer_benefit'}
                    onChange={(event) => onUpdate(item.id, { value: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="table-input"
                    value={item.work_value}
                    placeholder="Xóa"
                    disabled={currentReviewed}
                    onChange={(event) => onUpdate(item.id, { work_value: event.target.value })}
                  />
                </td>
                <td>
                  {needsPairCheck ? (
                    <span className="review-pair-next-label">Kiểm tra tiếp</span>
                  ) : currentReviewed ? (
                    <span className="review-pair-checked-label"><b>✓</b> Đã kiểm tra</span>
                  ) : reviewStatusLabel(item.status)}
                </td>
                <td>
                  <div className="table-actions">
                    <button type="button" disabled={currentReviewed} onClick={() => onConfirm(item.id)}>OK</button>
                    <button
                      type="button"
                      title={isPairedReview ? 'Mở lại cả cặp để kiểm tra và sửa' : 'Sửa kết quả này'}
                      onClick={() => onEdit(item.id)}
                    >
                      Sửa
                    </button>
                  </div>
                </td>
              </tr>
              )
            })}
            {!items.length && (
              <tr>
                <td colSpan={7}>Không có dữ liệu</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>}
    </div>
  )
}

function HistoryView({
  periods,
  finalCopies,
  detail,
  selectedPeriodId,
  selectedFinalCopyId,
  selectedEmployeeCode,
  filters,
  searchResults,
  loading,
  onFiltersChange,
  onSearch,
  onRefresh,
  onConfirm,
  onSelectPeriod,
  onSelectFinalCopy,
  onDeletePeriod,
  onDeleteFinalCopy,
  onDeleteMonth,
  onSelectSearchResult,
  onSaveEmployee,
  onDownloadOutput,
  onDownloadFinalCopy,
  onDownloadEmployeeImages,
  onDownloadFinalCopyEmployeeImages,
}: {
  periods: HistoryPeriod[]
  finalCopies: HistoryFinalCopy[]
  detail: HistoryDetail | null
  selectedPeriodId: string
  selectedFinalCopyId: string
  selectedEmployeeCode: string
  filters: { employee_code: string; month: string; year: string }
  searchResults: HistorySearchResult[]
  loading: boolean
  onFiltersChange: (filters: { employee_code: string; month: string; year: string }) => void
  onSearch: () => void
  onRefresh: () => void
  onConfirm: (options: ConfirmationOptions) => Promise<boolean>
  onSelectPeriod: (periodId: string) => void
  onSelectFinalCopy: (copyId: string) => void
  onDeletePeriod: (periodId: string) => void
  onDeleteFinalCopy: (copyId: string) => void
  onDeleteMonth: (month: number, year: number) => void
  onSelectSearchResult: (result: HistorySearchResult) => void
  onSaveEmployee: (periodId: string, employeeCode: string, draft: HistoryEmployeeDraft) => Promise<void>
  onDownloadOutput: (periodId: string, kind: 'output1' | 'output2') => Promise<void>
  onDownloadFinalCopy: (copyId: string, kind: 'output1' | 'output2') => Promise<void>
  onDownloadEmployeeImages: (periodId: string, kind?: 'output1' | 'output2') => Promise<void>
  onDownloadFinalCopyEmployeeImages: (copyId: string, kind?: 'output1' | 'output2') => Promise<void>
}) {
  const [detailMode, setDetailMode] = useState(false)
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewDirty, setReviewDirty] = useState(false)
  const selectedEmployee =
    detail?.employees.find((employee) => employee.employee_code === selectedEmployeeCode) ?? detail?.employees[0]
  const selectedFinalCopy = finalCopies.find((item) => item.id === selectedFinalCopyId) ?? null
  const selectedPeriod = periods.find((item) => item.id === selectedPeriodId) ?? null
  const selectedMonthKey = selectedFinalCopy
    ? `${selectedFinalCopy.year}-${selectedFinalCopy.month}`
    : selectedPeriod
      ? `${selectedPeriod.year}-${selectedPeriod.month}`
      : ''
  const historyMonths = Array.from(
    [...periods, ...finalCopies].reduce(
      (items, source) => {
        const key = `${source.year}-${source.month}`
        const item = items.get(key) ?? {
          key,
          month: source.month,
          year: source.year,
          periods: [] as HistoryPeriod[],
          finalCopy: null as HistoryFinalCopy | null,
        }
        if ('block_count' in source) {
          item.periods.push(source)
          item.periods.sort((left, right) => right.created_at.localeCompare(left.created_at))
        } else if (!item.finalCopy || source.modified_at > item.finalCopy.modified_at) {
          item.finalCopy = source
        }
        items.set(key, item)
        return items
      },
      new Map<
        string,
        { key: string; month: number; year: number; periods: HistoryPeriod[]; finalCopy: HistoryFinalCopy | null }
      >(),
    ).values(),
  ).sort((left, right) => right.year - left.year || right.month - left.month)
  const activeMonth = selectedFinalCopy?.month ?? detail?.period.month ?? null
  const activeYear = selectedFinalCopy?.year ?? detail?.period.year ?? null
  const relatedFinalCopy =
    activeMonth && activeYear ? finalCopies.find((item) => item.month === activeMonth && item.year === activeYear) ?? null : null
  const relatedPeriod =
    activeMonth && activeYear ? periods.find((item) => item.month === activeMonth && item.year === activeYear) ?? null : null
  const [draft, setDraft] = useState<HistoryEmployeeDraft | null>(null)
  const [baseline, setBaseline] = useState<HistoryEmployeeDraft | null>(null)
  const [savedFields, setSavedFields] = useState<HistoryEditableField[]>([])
  const [errorFields, setErrorFields] = useState<HistoryEditableField[]>([])
  const changedFields = getChangedHistoryFields(draft, baseline)
  const dailyChanged = getChangedHistoryDailyCount(draft, baseline)
  const hasChanges = changedFields.length > 0
  const hasAnyChanges = hasChanges || dailyChanged > 0
  const listItems =
    searchResults.length > 0
      ? searchResults
      : detail?.employees.map((employee) => historyEmployeeToSearchResult(detail.period, employee)) ?? []

  useEffect(() => {
    const nextDraft = selectedEmployee ? historyDraftFromEmployee(selectedEmployee) : null
    // The draft is local editable state that follows the selected history employee.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(nextDraft)
    setBaseline(nextDraft)
    setSavedFields([])
    setErrorFields([])
    // Employee code and period identity are the intended reset keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.period.id, selectedEmployee?.employee_code])

  async function confirmDiscardChanges() {
    if (!hasAnyChanges && !reviewDirty) return true
    return onConfirm({
      kicker: 'THAY ĐỔI CHƯA LƯU',
      title: 'Bỏ các thay đổi chưa lưu?',
      message: 'Nếu tiếp tục, các thay đổi hiện tại sẽ bị bỏ và app sẽ chuyển sang mục khác.',
      confirmLabel: 'Bỏ thay đổi',
      tone: 'danger',
    })
  }

  async function selectPeriodWithGuard(periodId: string) {
    if (await confirmDiscardChanges()) {
      onSelectPeriod(periodId)
      setDetailMode(false)
      setReviewMode(false)
      setReviewDirty(false)
    }
  }

  async function openDetail(result: HistorySearchResult) {
    if (await confirmDiscardChanges()) {
      await onSelectSearchResult(result)
      setDetailMode(true)
      setReviewMode(false)
      setReviewDirty(false)
    }
  }

  function updateDraft(field: HistoryEditableField, value: string) {
    const nextValue = field === 'employee_name' ? normalizeEmployeeName(value) : value
    setDraft((current) => (current ? { ...current, [field]: nextValue } : current))
    setSavedFields((fields) => fields.filter((item) => item !== field))
    setErrorFields((fields) => fields.filter((item) => item !== field))
  }

  function updateDailyDraft(day: number, patch: Partial<HistoryDailyDraft>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            daily_records: current.daily_records.map((row) => (row.day === day ? { ...row, ...patch } : row)),
          }
        : current,
    )
  }

  async function saveDraft() {
    if (!detail || !selectedEmployee || !draft || !hasAnyChanges) return

    try {
      await onSaveEmployee(detail.period.id, selectedEmployee.employee_code, draft)
      setBaseline(draft)
      setSavedFields(changedFields)
      window.setTimeout(() => setSavedFields([]), 1600)
    } catch {
      setErrorFields(changedFields)
    }
  }

  function cancelDraft() {
    setDraft(baseline)
    setSavedFields([])
    setErrorFields([])
  }

  if (detailMode && detail && selectedEmployee && draft) {
    return (
      <HistoryEmployeeDetailPage
        detail={detail}
        employee={selectedEmployee}
        draft={draft}
        loading={loading}
        changedFields={changedFields}
        savedFields={savedFields}
        errorFields={errorFields}
        dailyChanged={dailyChanged}
        hasAnyChanges={hasAnyChanges}
        onBack={async () => {
          if (await confirmDiscardChanges()) setDetailMode(false)
        }}
        onDraftChange={updateDraft}
        onDailyChange={updateDailyDraft}
        onSave={saveDraft}
        onCancel={cancelDraft}
      />
    )
  }

  if (reviewMode && detail) {
    return (
      <HistoryReviewPage
        detail={detail}
        loading={loading}
        onBack={async () => {
          if (await confirmDiscardChanges()) {
            setReviewMode(false)
            setReviewDirty(false)
          }
        }}
        onDirtyChange={setReviewDirty}
        onSaveEmployee={onSaveEmployee}
        onDownloadOutput={onDownloadOutput}
      />
    )
  }

  const reviewSummary = detail ? getHistoryReviewSummary(detail) : { confirmed: 0, total: 0 }

  return (
    <section className="history-search-layout">
      <div className="panel history-filters">
        <div className="panel-heading">
          <h2>Lịch sử chấm công</h2>
          <span>{periods.length} kỳ</span>
        </div>
        <div className="history-search">
          <Input
            label="Mã nhân viên"
            value={filters.employee_code}
            onChange={(value) => onFiltersChange({ ...filters, employee_code: value })}
          />
          <Input
            label="Tháng"
            value={filters.month}
            onChange={(value) => onFiltersChange({ ...filters, month: value })}
            type="number"
          />
          <Input
            label="Năm"
            value={filters.year}
            onChange={(value) => onFiltersChange({ ...filters, year: value })}
            type="number"
          />
          <div className="history-actions">
            <button type="button" disabled={loading} onClick={onSearch}>Tìm</button>
            <button type="button" disabled={loading} onClick={onRefresh}>Tải lại</button>
          </div>
        </div>
        <div className="employee-buttons period-buttons">
          {historyMonths.map((item) => {
            const period = item.periods[0] ?? null
            const isActive = item.key === selectedMonthKey
            return (
              <div
                key={item.key}
                className={['period-item history-month-item', isActive ? 'active' : '', item.finalCopy ? 'has-final-copy' : ''].join(' ')}
              >
                <button
                  type="button"
                  className="period-main"
                  onClick={() => {
                    if (period) selectPeriodWithGuard(period.id)
                    else if (item.finalCopy) onSelectFinalCopy(item.finalCopy.id)
                  }}
                >
                  <span className="history-month-title">Tháng {item.month.toString().padStart(2, '0')}/{item.year}</span>
                  <small className="history-month-meta">
                    <span>
                      {period
                        ? `${period.block_count} mã chấm máy${item.periods.length > 1 ? ` · ${item.periods.length} bản` : ''}`
                        : 'Chưa có bản chấm máy'}
                    </span>
                    <span className={item.finalCopy ? 'final-copy-status active' : 'final-copy-status'}>
                      {item.finalCopy ? `Có bản chốt · ${formatDateTime(item.finalCopy.modified_at)}` : 'Chưa có bản chốt'}
                    </span>
                  </small>
                </button>
                <div className="history-month-delete-actions">
                  {period && (
                    <button
                      type="button"
                      className="period-delete"
                      disabled={loading}
                      onClick={() => onDeletePeriod(period.id)}
                    >
                      Xóa bản máy
                    </button>
                  )}
                  {item.finalCopy && (
                    <button
                      type="button"
                      className="period-delete final-copy-delete"
                      disabled={loading}
                      onClick={() => onDeleteFinalCopy(item.finalCopy!.id)}
                    >
                      Xóa bản chốt
                    </button>
                  )}
                  {period && (
                    <button
                      type="button"
                      className="period-delete whole-month-delete"
                      disabled={loading}
                      onClick={() => onDeleteMonth(item.month, item.year)}
                    >
                      Xóa cả tháng
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="panel history-results">
        <HistoryPeriodActionBar
          detail={detail}
          finalCopy={selectedFinalCopy}
          relatedPeriod={relatedPeriod}
          relatedFinalCopy={relatedFinalCopy}
          loading={loading}
          reviewSummary={reviewSummary}
          onDownloadOutput={onDownloadOutput}
          onDownloadFinalCopy={onDownloadFinalCopy}
          onDownloadEmployeeImages={onDownloadEmployeeImages}
          onDownloadFinalCopyEmployeeImages={onDownloadFinalCopyEmployeeImages}
          onSelectPeriod={onSelectPeriod}
          onSelectFinalCopy={onSelectFinalCopy}
          onOpenReview={() => {
            if (detail) {
              setReviewMode(true)
              setReviewDirty(false)
            }
          }}
        />
        {selectedFinalCopy ? (
          <FinalCopyHistoryPanel finalCopy={selectedFinalCopy} loading={loading} onDownload={onDownloadFinalCopy} />
        ) : (
          <>
        <div className="panel-heading">
          <h2>Danh sách nhân viên</h2>
          <span>{listItems.length} dòng</span>
        </div>
        <div className="table-wrap history-result-table">
          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên</th>
                <th>Tháng</th>
                <th>Tổng giờ</th>
                <th>Ngày công</th>
                <th>Lương tháng</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {listItems.map((item) => (
                <tr key={`${item.period_id}-${item.employee_code}`}>
                  <td>{item.employee_code}</td>
                  <td>{item.employee_name || '-'}</td>
                  <td>{item.label}</td>
                  <td>{formatNumber(item.total_hours)}</td>
                  <td>{formatNumber(item.work_days)}</td>
                  <td>{formatMoney(item.final_salary)}</td>
                  <td>
                    <button type="button" className="detail-link-button" onClick={() => void openDetail(item)}>
                      Chi tiết &gt;&gt;
                    </button>
                  </td>
                </tr>
              ))}
              {!listItems.length && (
                <tr>
                  <td colSpan={7}>Chưa có kết quả phù hợp</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
          </>
        )}
      </div>
    </section>
  )
}

function FinalCopyHistoryPanel({
  finalCopy,
  loading,
  onDownload,
}: {
  finalCopy: HistoryFinalCopy
  loading: boolean
  onDownload: (copyId: string, kind: 'output1' | 'output2') => Promise<void>
}) {
  return (
    <div className="final-copy-history-panel">
      <div className="panel-heading">
        <div>
          <h2>Ban sao cuoi cung</h2>
          <p>{finalCopy.filename}</p>
        </div>
        <span>{formatDateTime(finalCopy.modified_at)}</span>
      </div>
      <div className="final-copy-summary">
        <div>
          <span>Ky</span>
          <strong>{finalCopy.month.toString().padStart(2, '0')}/{finalCopy.year}</strong>
        </div>
        <div>
          <span>Thu muc</span>
          <strong>{finalCopy.folder}</strong>
        </div>
        <div>
          <span>Ghi chu</span>
          <strong>Ban chot Drive khong co bang ra soat tung dong nhu ban may cham.</strong>
        </div>
      </div>
      <div className="history-period-actions final-copy-actions">
        <button type="button" disabled={loading} onClick={() => onDownload(finalCopy.id, 'output1')}>
          Output 1
        </button>
        <button type="button" disabled={loading} onClick={() => onDownload(finalCopy.id, 'output2')}>
          Output 2
        </button>
      </div>
    </div>
  )
}

function HistoryPeriodActionBar({
  detail,
  finalCopy,
  relatedPeriod,
  relatedFinalCopy,
  loading,
  reviewSummary,
  onDownloadOutput,
  onDownloadFinalCopy,
  onDownloadEmployeeImages,
  onDownloadFinalCopyEmployeeImages,
  onSelectPeriod,
  onSelectFinalCopy,
  onOpenReview,
}: {
  detail: HistoryDetail | null
  finalCopy: HistoryFinalCopy | null
  relatedPeriod: HistoryPeriod | null
  relatedFinalCopy: HistoryFinalCopy | null
  loading: boolean
  reviewSummary: { confirmed: number; total: number }
  onDownloadOutput: (periodId: string, kind: 'output1' | 'output2') => Promise<void>
  onDownloadFinalCopy: (copyId: string, kind: 'output1' | 'output2') => Promise<void>
  onDownloadEmployeeImages: (periodId: string, kind?: 'output1' | 'output2') => Promise<void>
  onDownloadFinalCopyEmployeeImages: (copyId: string, kind?: 'output1' | 'output2') => Promise<void>
  onSelectPeriod: (periodId: string) => void
  onSelectFinalCopy: (copyId: string) => void
  onOpenReview: () => void
}) {
  const [imageChoiceOpen, setImageChoiceOpen] = useState(false)
  const title = finalCopy
    ? `Dang xem: ${finalCopy.label}`
    : detail
      ? `Dang xem: ${detail.period.label}`
      : 'Chua chon ky lich su'
  const subtitle = finalCopy
    ? `Ban chot Drive: ${finalCopy.filename} - ${formatDateTime(finalCopy.modified_at)}`
    : detail
      ? `${detail.employees.length} nhan vien - ${reviewSummary.confirmed} da xac nhan / ${reviewSummary.total} dong kiem tra`
      : 'Chon mot ky ben trai de xuat file hoac ra soat xac nhan.'

  return (
    <>
    {imageChoiceOpen && (
      <div className="export-choice-backdrop" role="presentation" onMouseDown={() => setImageChoiceOpen(false)}>
        <section className="export-choice-dialog employee-card-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="history-image-choice-title" onMouseDown={(event) => event.stopPropagation()}>
          <p className="export-choice-kicker">Ảnh bảng công nhân viên</p>
          <h2 id="history-image-choice-title">Chọn Output cần chụp</h2>
          <p>Output 2 sẽ lấy cả vùng ngày công và khu vực lương trong ảnh.</p>
          <div className="export-choice-options">
            <button type="button" className="export-choice-card" onClick={() => { setImageChoiceOpen(false); if (finalCopy) void onDownloadFinalCopyEmployeeImages(finalCopy.id, 'output1'); else if (detail) void onDownloadEmployeeImages(detail.period.id, 'output1') }}>
              <strong>Ảnh Output 1</strong><span>Chỉ phần chấm công và thông tin nhân viên.</span>
            </button>
            <button type="button" className="export-choice-card formula-only" onClick={() => { setImageChoiceOpen(false); if (finalCopy) void onDownloadFinalCopyEmployeeImages(finalCopy.id, 'output2'); else if (detail) void onDownloadEmployeeImages(detail.period.id, 'output2') }}>
              <strong>Ảnh Output 2</strong><span>Phần chấm công cùng toàn bộ khu vực lương.</span>
            </button>
          </div>
          <button type="button" className="secondary-button export-choice-cancel" onClick={() => setImageChoiceOpen(false)}>Hủy</button>
        </section>
      </div>
    )}
    <div className="history-period-actionbar">
      <div className="history-period-context">
        <strong>{title}</strong>
        <span>{subtitle}</span>
        <strong>{detail ? `Dữ liệu đang xem: ${detail.period.label}` : 'Chưa chọn kỳ lịch sử'}</strong>
        <span>
          {detail
            ? `${detail.employees.length} nhân viên - ${reviewSummary.confirmed} đã xác nhận / ${reviewSummary.total} dòng kiểm tra`
            : 'Chọn một kỳ bên trái để xuất file hoặc rà soát xác nhận.'}
        </span>
        {(relatedFinalCopy || relatedPeriod) && (
          <div className="history-source-toggle">
            {relatedFinalCopy && (
              <button
                type="button"
                className={finalCopy ? 'active' : ''}
                disabled={loading}
                onClick={() => onSelectFinalCopy(relatedFinalCopy.id)}
              >
                Ban sao cuoi cung
              </button>
            )}
            {relatedPeriod && (
              <button
                type="button"
                className={detail ? 'active' : ''}
                disabled={loading}
                onClick={() => onSelectPeriod(relatedPeriod.id)}
              >
                Ban may cham
              </button>
            )}
          </div>
        )}
      </div>
      <div className="history-period-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={loading || (!detail && !finalCopy)}
          onClick={() => {
            if (finalCopy) onDownloadFinalCopy(finalCopy.id, 'output1')
            else if (detail) onDownloadOutput(detail.period.id, 'output1')
          }}
        >
          Output 1
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={loading || (!detail && !finalCopy)}
          onClick={() => {
            if (finalCopy) onDownloadFinalCopy(finalCopy.id, 'output2')
            else if (detail) onDownloadOutput(detail.period.id, 'output2')
          }}
        >
          Output 2
        </button>
        <button
          type="button"
          className="secondary-button history-image-export"
          disabled={loading || (!detail && !finalCopy)}
          onClick={() => setImageChoiceOpen(true)}
        >
          Ảnh bảng công
        </button>
        <button type="button" disabled={loading || !detail || Boolean(finalCopy)} onClick={onOpenReview}>
          Rà soát xác nhận
        </button>
      </div>
    </div>
    </>
  )
}

function HistoryReviewPage({
  detail,
  loading,
  onBack,
  onDirtyChange,
  onSaveEmployee,
  onDownloadOutput,
}: {
  detail: HistoryDetail
  loading: boolean
  onBack: () => void
  onDirtyChange: (dirty: boolean) => void
  onSaveEmployee: (periodId: string, employeeCode: string, draft: HistoryEmployeeDraft) => Promise<void>
  onDownloadOutput: (periodId: string, kind: 'output1' | 'output2') => Promise<void>
}) {
  const [drafts, setDrafts] = useState<Record<string, HistoryEmployeeDraft>>({})
  const [baselineDrafts, setBaselineDrafts] = useState<Record<string, HistoryEmployeeDraft>>({})
  const [saving, setSaving] = useState(false)
  const employeesByCode = Object.fromEntries(detail.employees.map((employee) => [employee.employee_code, employee]))

  useEffect(() => {
    const nextDrafts = Object.fromEntries(
      detail.employees.map((employee) => [employee.employee_code, historyDraftFromEmployee(employee)]),
    )
    // Review drafts are reset only when opening another saved period.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts(nextDrafts)
    setBaselineDrafts(nextDrafts)
    onDirtyChange(false)
    // Period identity is the intended reset key; employee edits are managed locally below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.period.id])

  const dirtyEmployeeCodes = Object.keys(drafts).filter((employeeCode) =>
    hasHistoryDraftChanges(drafts[employeeCode], baselineDrafts[employeeCode]),
  )
  const rows = getHistoryReviewRows(detail, drafts, baselineDrafts)
  const confirmedCount = rows.filter((row) => row.confirmed).length

  useEffect(() => {
    onDirtyChange(dirtyEmployeeCodes.length > 0)
    // Notify only when the dirty count changes; the callback identity is owned by the parent view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyEmployeeCodes.length])

  function updateDailyDraft(employeeCode: string, day: number, patch: Partial<HistoryDailyDraft>) {
    setDrafts((current) => {
      const draft = current[employeeCode]
      if (!draft) return current
      return {
        ...current,
        [employeeCode]: {
          ...draft,
          daily_records: draft.daily_records.map((row) => (row.day === day ? { ...row, ...patch } : row)),
        },
      }
    })
  }

  function cancelChanges() {
    setDrafts(baselineDrafts)
    onDirtyChange(false)
  }

  async function saveChanges() {
    if (!dirtyEmployeeCodes.length) return

    setSaving(true)
    try {
      for (const employeeCode of dirtyEmployeeCodes) {
        const draft = drafts[employeeCode]
        if (draft) {
          await onSaveEmployee(detail.period.id, employeeCode, draft)
        }
      }
      setBaselineDrafts(drafts)
      onDirtyChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="history-review-page">
      <div className="panel history-review-header">
        <div className="panel-heading">
          <button type="button" className="secondary-button" onClick={onBack}>Quay lại</button>
          <div className="history-detail-title">
            <h2>Rà soát xác nhận</h2>
            <span>{detail.period.label}</span>
          </div>
          <div className="history-editor-actions">
            <button type="button" className="secondary-button" disabled={loading || saving} onClick={() => onDownloadOutput(detail.period.id, 'output1')}>
              Output 1
            </button>
            <button type="button" className="secondary-button" disabled={loading || saving} onClick={() => onDownloadOutput(detail.period.id, 'output2')}>
              Output 2
            </button>
            <button type="button" className="secondary-button" disabled={loading || saving || !dirtyEmployeeCodes.length} onClick={cancelChanges}>
              Hủy
            </button>
            <button type="button" disabled={loading || saving || !dirtyEmployeeCodes.length} onClick={saveChanges}>
              {saving ? 'Đang lưu...' : 'OK'}
            </button>
          </div>
        </div>
        <div className="preview-grid history-metrics">
          <Metric label="Nhân viên" value={detail.employees.length} />
          <Metric label="Dòng kiểm tra" value={rows.length} />
          <Metric label="Đã xác nhận" value={confirmedCount} />
          <Metric label="Thay đổi" value={dirtyEmployeeCodes.length} />
        </div>
      </div>

      <div className="panel history-review-table-panel">
        <div className="panel-heading">
          <h2>Dòng cần rà soát</h2>
          <span>{rows.length} dòng</span>
        </div>
        <div className="table-wrap history-review-table">
          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên</th>
                <th>Ngày</th>
                <th>Giờ bấm</th>
                <th>Công</th>
                <th>Quên / ?</th>
                <th>Trễ</th>
                <th>Ghi chú xác nhận</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const employee = employeesByCode[row.employeeCode]
                return (
                  <tr key={`${row.employeeCode}-${row.day}`} className={row.changed ? 'edit-dirty-row' : row.confirmed ? 'selected-row' : 'warning-row'}>
                    <td>{row.employeeCode}</td>
                    <td>{employee?.employee_name || '-'}</td>
                    <td>{row.day}</td>
                    <td>{row.punches.join(', ')}</td>
                    <td>
                      <input className="table-input" value={row.draft.work_value} onChange={(event) => updateDailyDraft(row.employeeCode, row.day, { work_value: event.target.value })} />
                    </td>
                    <td>
                      <input className="table-input" value={row.draft.missing_count} onChange={(event) => updateDailyDraft(row.employeeCode, row.day, { missing_count: event.target.value })} />
                    </td>
                    <td>
                      <input className="table-input" value={row.draft.late_minutes} onChange={(event) => updateDailyDraft(row.employeeCode, row.day, { late_minutes: event.target.value })} />
                    </td>
                    <td>
                      <input className="table-input wide-input" value={row.draft.note} onChange={(event) => updateDailyDraft(row.employeeCode, row.day, { note: event.target.value })} />
                    </td>
                  </tr>
                )
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={8}>Kỳ này chưa có dòng xác nhận hoặc kiểm tra.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function HistoryEmployeeDetailPage({
  detail,
  employee,
  draft,
  loading,
  changedFields,
  savedFields,
  errorFields,
  dailyChanged,
  hasAnyChanges,
  onBack,
  onDraftChange,
  onDailyChange,
  onSave,
  onCancel,
}: {
  detail: HistoryDetail
  employee: HistoryEmployee
  draft: HistoryEmployeeDraft
  loading: boolean
  changedFields: HistoryEditableField[]
  savedFields: HistoryEditableField[]
  errorFields: HistoryEditableField[]
  dailyChanged: number
  hasAnyChanges: boolean
  onBack: () => void
  onDraftChange: (field: HistoryEditableField, value: string) => void
  onDailyChange: (day: number, patch: Partial<HistoryDailyDraft>) => void
  onSave: () => void
  onCancel: () => void
}) {
  const issueCount = draft.daily_records.filter(isHistoryDailyIssue).length
  const changeCount = changedFields.length + dailyChanged
  const calculated = calculateHistoryOutput2(draft, employee)
  const [showIssueRowsOnly, setShowIssueRowsOnly] = useState(false)
  const visibleDailyRecords = showIssueRowsOnly
    ? draft.daily_records.filter(isHistoryDailyIssue)
    : draft.daily_records

  return (
    <section className="history-detail-page">
      <div className="panel history-detail-header">
        <div className="panel-heading">
          <button type="button" className="secondary-button" onClick={onBack}>Quay lại</button>
          <div className="history-detail-title">
            <h2>{employee.employee_code} - {draft.employee_name || employee.employee_name || 'Chưa có tên'}</h2>
            <span>{detail.period.label}</span>
          </div>
          <div className="history-editor-actions">
            <button type="button" className="secondary-button" disabled={loading || !hasAnyChanges} onClick={onCancel}>Hủy</button>
            <button type="button" disabled={loading || !hasAnyChanges} onClick={onSave}>OK</button>
          </div>
        </div>
        <div className="preview-grid history-metrics">
          <Metric label="Tổng giờ" value={formatNumber(calculated.totalHours)} />
          <Metric label="Ngày công" value={formatNumber(calculated.workDays)} />
          <div className="metric metric-action">
            <span>Cần kiểm tra</span>
            <strong>{issueCount}</strong>
            <button
              type="button"
              className="secondary-button"
              disabled={!issueCount}
              onClick={() => setShowIssueRowsOnly((value) => !value)}
            >
              {showIssueRowsOnly ? 'Tất cả' : 'Xem'}
            </button>
          </div>
          <Metric label="Thay đổi" value={changeCount} />
        </div>
      </div>

      <div className="panel history-detail-work">
        <div className="panel-heading">
          <h2>{showIssueRowsOnly ? 'Dòng cần kiểm tra' : 'Danh sách giờ công'}</h2>
          <span>{visibleDailyRecords.length} ngày</span>
        </div>
        <div className="table-wrap editable-work-table">
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Giờ bấm</th>
                <th>Công</th>
                <th>Quên / ?</th>
                <th>Trễ</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {visibleDailyRecords.map((row) => (
                <tr key={row.day} className={isHistoryDailyChanged(row, baselineDailyRow(employee, row.day)) ? 'edit-dirty-row' : ''}>
                  <td>{row.day}</td>
                  <td>{row.punches.join(', ')}</td>
                  <td>
                    <input className="table-input" value={row.work_value} onChange={(event) => onDailyChange(row.day, { work_value: event.target.value })} />
                  </td>
                  <td>
                    <input className="table-input" value={row.missing_count} onChange={(event) => onDailyChange(row.day, { missing_count: event.target.value })} />
                  </td>
                  <td>
                    <input className="table-input" value={row.late_minutes} onChange={(event) => onDailyChange(row.day, { late_minutes: event.target.value })} />
                  </td>
                  <td>
                    <input className="table-input wide-input" value={row.note} onChange={(event) => onDailyChange(row.day, { note: event.target.value })} />
                  </td>
                </tr>
              ))}
              {!visibleDailyRecords.length && (
                <tr>
                  <td colSpan={6}>Không có dòng cần kiểm tra cho nhân viên này</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel history-payroll-panel">
        <div className="panel-heading">
          <h2>Lương thưởng phạt</h2>
          <span>{hasAnyChanges ? 'Chưa lưu' : 'Đã đồng bộ'}</span>
        </div>
        <div className="history-edit-grid">
          <EditableHistoryField
            label="Tên"
            value={draft.employee_name}
            status={historyFieldStatus('employee_name', changedFields, savedFields, errorFields)}
            onChange={(value) => onDraftChange('employee_name', value)}
          />
          <EditableHistoryField
            label="Lương 1 giờ"
            value={draft.hourly_salary}
            type="number"
            status={historyFieldStatus('hourly_salary', changedFields, savedFields, errorFields)}
            onChange={(value) => onDraftChange('hourly_salary', value)}
          />
          <EditableHistoryField
            label="Thưởng"
            value={draft.bonus}
            type="number"
            status={historyFieldStatus('bonus', changedFields, savedFields, errorFields)}
            onChange={(value) => onDraftChange('bonus', value)}
          />
          <EditableHistoryField
            label="Phạt / ứng"
            value={draft.advance_or_penalty}
            type="number"
            status={historyFieldStatus('advance_or_penalty', changedFields, savedFields, errorFields)}
            onChange={(value) => onDraftChange('advance_or_penalty', value)}
          />
          <label className={`field field-wide editable-field ${historyFieldStatus('note', changedFields, savedFields, errorFields)}`}>
            <span>Ghi chú lương</span>
            <textarea value={draft.note} onChange={(event) => onDraftChange('note', event.target.value)} />
          </label>
        </div>
        <div className="payroll-formula-strip">
          <div>
            <span>Tổng giờ</span>
            <strong>{formatNumber(calculated.totalHours)}</strong>
          </div>
          <div>
            <span>Mức lương</span>
            <strong>{formatMoney(calculated.monthlySalary)}</strong>
          </div>
          <div>
            <span>Lương 1 ngày</span>
            <strong>{formatMoney(calculated.dailySalary)}</strong>
          </div>
          <div>
            <span>Lương công</span>
            <strong>{formatMoney(calculated.baseSalary)}</strong>
          </div>
          <div>
            <span>Lương cuối</span>
            <strong>{formatMoney(calculated.finalSalary)}</strong>
          </div>
          <p>Tính theo Output 2: Tổng giờ x lương 1 giờ + thưởng - phạt/ứng.</p>
        </div>
      </div>
    </section>
  )
}

function AttendanceOverviewView({
  overview,
  year,
  search,
  status,
  selectedCode,
  loading,
  onYearChange,
  onSearchChange,
  onStatusChange,
  onSelectEmployee,
  onReload,
}: {
  overview: AttendanceOverview | null
  year: string
  search: string
  status: 'all' | 'active' | 'inactive'
  selectedCode: string
  loading: boolean
  onYearChange: (year: string) => void
  onSearchChange: (search: string) => void
  onStatusChange: (status: 'all' | 'active' | 'inactive') => void
  onSelectEmployee: (employeeCode: string) => void
  onReload: () => void
}) {
  const employees = overview?.employees ?? []
  const normalizedSearch = search.trim().toLowerCase()
  const filteredEmployees = employees.filter((employee) => {
    const matchesStatus =
      status === 'all' || (status === 'active' && employee.active) || (status === 'inactive' && !employee.active)
    const matchesSearch =
      !normalizedSearch ||
      employee.employee_code.toLowerCase().includes(normalizedSearch) ||
      employee.employee_name.toLowerCase().includes(normalizedSearch)
    return matchesStatus && matchesSearch
  })
  const selectedEmployee =
    employees.find((employee) => employee.employee_code === selectedCode) ?? filteredEmployees[0] ?? employees[0]
  const latestMonth = overview?.latest_month ?? null

  return (
    <section className="attendance-overview-layout">
      <div className="panel overview-toolbar">
        <div className="panel-heading">
          <h2>Chuyên cần</h2>
          <span>{overview?.year ?? 'Chưa có dữ liệu'}</span>
        </div>
        {overview?.source && (
          <p className="panel-note">
            Lịch sử đã lưu: {overview.source.machine_months.length ? overview.source.machine_months.map((month) => `T${month}`).join(', ') : 'chưa có'}.
            {' '}Bản sao cuối dự phòng: {overview.source.fallback_final_copy_months?.length
              ? overview.source.fallback_final_copy_months.map((month) => `T${month}`).join(', ')
              : 'không có'}.
          </p>
        )}
        <div className="overview-controls">
          <label className="field">
            <span>Năm</span>
            <select value={year} onChange={(event) => onYearChange(event.target.value)}>
              {(overview?.years ?? []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <Input label="Tìm mã / tên" value={search} onChange={onSearchChange} />
          <div className="overview-status-strip">
            <button type="button" className={status === 'all' ? 'active' : ''} onClick={() => onStatusChange('all')}>
              Tất cả
            </button>
            <button type="button" className={status === 'active' ? 'active' : ''} onClick={() => onStatusChange('active')}>
              Đang làm
            </button>
            <button type="button" className={status === 'inactive' ? 'active' : ''} onClick={() => onStatusChange('inactive')}>
              Không có công
            </button>
          </div>
          <button type="button" disabled={loading} onClick={onReload}>Tải lại</button>
        </div>
      </div>

      <section className="summary-grid overview-summary">
        <Metric label="Tháng mới nhất" value={latestMonth ? `T${latestMonth}` : '-'} />
        <Metric label="Đang làm" value={overview?.summary.active_count ?? 0} />
        <Metric label="Không có công" value={overview?.summary.inactive_count ?? 0} />
        <Metric label="Tổng nhân viên" value={overview?.summary.employee_count ?? 0} />
        <Metric label="Tổng ngày công" value={formatNumber(overview?.summary.total_work_days ?? 0)} />
        <Metric label="Tổng giờ" value={formatNumber(overview?.summary.total_hours ?? 0)} />
      </section>

      <div className="panel overview-table-panel">
        <div className="panel-heading">
          <h2>Bảng chuyên cần năm</h2>
          <span>{filteredEmployees.length} mã</span>
        </div>
        <div className="table-wrap overview-table">
          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên</th>
                <th>Trạng thái</th>
                {Array.from({ length: 12 }, (_, index) => (
                  <th key={index}>T{index + 1}</th>
                ))}
                <th>Tổng ngày</th>
                <th>TB/tháng</th>
                <th>Tổng giờ</th>
                <th>Trễ</th>
                <th>?</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((employee) => (
                <tr
                  key={employee.employee_code}
                  className={[
                    employee.employee_code === selectedEmployee?.employee_code ? 'selected-row' : '',
                    employee.active ? 'overview-active-row' : 'overview-inactive-row',
                  ].join(' ')}
                  onClick={() => onSelectEmployee(employee.employee_code)}
                >
                  <td>{employee.employee_code}</td>
                  <td>{employee.employee_name || '-'}</td>
                  <td>
                    <span className={employee.active ? 'status-pill active' : 'status-pill inactive'}>
                      {employee.active ? 'Đang làm' : 'Không có công'}
                    </span>
                  </td>
                  {employee.months.map((month) => (
                    <td
                      key={month.month}
                      className={[
                        latestMonth === month.month ? 'latest-month-cell' : '',
                        month.work_days === 0 ? 'zero-month-cell' : '',
                      ].join(' ')}
                    >
                      {formatNumber(month.work_days)}
                    </td>
                  ))}
                  <td>{formatNumber(employee.total_work_days)}</td>
                  <td>{formatNumber(employee.average_work_days)}</td>
                  <td>{formatNumber(employee.total_hours)}</td>
                  <td>{employee.total_late_count}</td>
                  <td>{employee.total_issue_count}</td>
                </tr>
              ))}
              {!filteredEmployees.length && (
                <tr>
                  <td colSpan={20}>Không có dữ liệu</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel overview-chart-panel">
        <div className="panel-heading">
          <h2>Xu hướng nhân viên</h2>
          <span>{selectedEmployee?.employee_code ?? 'Chưa chọn'}</span>
        </div>
        {selectedEmployee ? (
          <>
            <div className="preview-grid overview-employee-metrics">
              <Metric label="Tổng ngày" value={formatNumber(selectedEmployee.total_work_days)} />
              <Metric label="TB/tháng" value={formatNumber(selectedEmployee.average_work_days)} />
              <Metric label="Tổng giờ" value={formatNumber(selectedEmployee.total_hours)} />
              <Metric label="Trễ / ?" value={`${selectedEmployee.total_late_count} / ${selectedEmployee.total_issue_count}`} />
            </div>
            <AttendanceTrendChart employee={selectedEmployee} latestMonth={latestMonth} />
          </>
        ) : (
          <p className="empty-note">Chưa có nhân viên để hiển thị.</p>
        )}
      </div>
    </section>
  )
}

function AttendanceTrendChart({
  employee,
  latestMonth,
}: {
  employee: AttendanceOverviewEmployee
  latestMonth: number | null
}) {
  const width = 760
  const height = 260
  const padding = { top: 18, right: 22, bottom: 36, left: 42 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const maxDays = Math.max(30, ...employee.months.map((month) => Number(month.work_days || 0)))
  const points = employee.months.map((month, index) => {
    const x = padding.left + (chartWidth / 11) * index
    const y = padding.top + chartHeight - (Number(month.work_days || 0) / maxDays) * chartHeight
    return { x, y, month }
  })
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

  return (
    <div className="overview-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Biểu đồ ngày công theo tháng">
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartHeight} className="chart-axis" />
        <line x1={padding.left} y1={padding.top + chartHeight} x2={padding.left + chartWidth} y2={padding.top + chartHeight} className="chart-axis" />
        {[0, 10, 20, 30].map((value) => {
          const y = padding.top + chartHeight - (value / maxDays) * chartHeight
          return (
            <g key={value}>
              <line x1={padding.left} y1={y} x2={padding.left + chartWidth} y2={y} className="chart-grid-line" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="chart-label">{value}</text>
            </g>
          )
        })}
        <path d={path} className="chart-line" fill="none" />
        {points.map((point) => (
          <g key={point.month.month}>
            <circle
              cx={point.x}
              cy={point.y}
              r={latestMonth === point.month.month ? 5 : 4}
              className={point.month.work_days > 0 ? 'chart-dot active' : 'chart-dot zero'}
            />
            <text x={point.x} y={height - 12} textAnchor="middle" className="chart-label">T{point.month.month}</text>
            <title>{`T${point.month.month}: ${formatNumber(point.month.work_days)} ngày, ${formatNumber(point.month.total_hours)} giờ`}</title>
          </g>
        ))}
      </svg>
      <div className="overview-hour-bars">
        {employee.months.map((month) => {
          const maxHours = Math.max(1, ...employee.months.map((item) => Number(item.total_hours || 0)))
          const percent = Math.max(0, Math.min(100, (Number(month.total_hours || 0) / maxHours) * 100))
          return (
            <div className="hour-bar-row" key={month.month}>
              <span>T{month.month}</span>
              <div><i style={{ width: `${percent}%` }} /></div>
              <b>{formatNumber(month.total_hours)}h</b>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EditableHistoryField({
  label,
  value,
  status,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  status: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className={`field editable-field ${status}`}>
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function EmployeeWorkPanel({
  id,
  title,
  employeeCode,
  rows,
  totalHours,
  workDays,
}: {
  id?: string
  title: string
  employeeCode: string
  rows: WorkDayRow[]
  totalHours: number
  workDays: number
}) {
  const rowsWithData = rows.filter(
    (row) =>
      row.punches.length ||
      row.work_value !== null ||
      row.missing_count !== null ||
      row.late_minutes !== null ||
      row.manual_checks.length,
  )

  return (
    <div className="employee-detail-panel" id={id}>
      <div className="panel-heading">
        <h2>{title}</h2>
        <span>{employeeCode || 'Chưa chọn'}</span>
      </div>
      <div className="preview-grid employee-detail-metrics">
        <Metric label="Tổng giờ" value={formatNumber(totalHours)} />
        <Metric label="Ngày công" value={formatNumber(workDays)} />
        <Metric label="Ngày có dữ liệu" value={rowsWithData.length} />
        <Metric label="Cần kiểm tra" value={rowsWithData.filter((row) => row.manual_checks.length).length} />
      </div>
      <div className="table-wrap employee-day-table">
        <table>
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Giờ bấm</th>
              <th>Công</th>
              <th>Quên / ?</th>
              <th>Trễ</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {rowsWithData.map((row) => (
              <tr key={row.day} className={row.manual_checks.length ? 'warning-row' : ''}>
                <td>{row.day}</td>
                <td>{row.punches.join(', ')}</td>
                <td>{formatNullable(row.work_value)}</td>
                <td>{formatNullable(row.missing_count)}</td>
                <td>{row.late_minutes ? `${row.late_minutes} phút` : ''}</td>
                <td>{row.manual_checks.join('; ')}</td>
              </tr>
            ))}
            {!rowsWithData.length && (
              <tr>
                <td colSpan={6}>Chưa có dữ liệu công cho nhân viên này</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ExcelDropZone({
  id,
  file,
  displayName,
  placeholder,
  busy,
  disabled = false,
  allowLegacyXls = false,
  onFile,
}: {
  id: string
  file: File | null
  displayName?: string
  placeholder: string
  busy?: string | null
  disabled?: boolean
  allowLegacyXls?: boolean
  onFile: (file: File | null) => void | Promise<void>
}) {
  const [dragging, setDragging] = useState(false)

  function receiveFile(nextFile: File | null) {
    if (disabled) return
    setDragging(false)
    void onFile(nextFile)
  }

  return (
    <div
      className={`file-control drop-file-control${dragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) {
          event.dataTransfer.dropEffect = 'copy'
          setDragging(true)
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        receiveFile(event.dataTransfer.files?.[0] ?? null)
      }}
    >
      <input
        id={id}
        type="file"
        accept={allowLegacyXls ? '.xls,.xlsx,.xlsm' : '.xlsx,.xlsm'}
        disabled={disabled}
        onChange={(event) => {
          const selectedFile = event.currentTarget.files?.[0] ?? null
          event.currentTarget.value = ''
          receiveFile(selectedFile)
        }}
      />
      <label htmlFor={id} title={file?.name || displayName || placeholder}>
        <span>{dragging ? 'Thả file vào đây' : busy || file?.name || displayName || placeholder}</span>
      </label>
    </div>
  )
}


function Input({
  label,
  value,
  onChange,
  type = 'text',
  readOnly = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  readOnly?: boolean
}) {
  return (
    <label className={`field ${readOnly ? 'readonly-field' : ''}`}>
      <span>{label}</span>
      <input type={type} value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function calculatedMonthlySalaryValue(form: PayrollForm) {
  const monthlySalary = parseOptionalNumber(form.monthly_salary)
  if (monthlySalary !== null) return String(roundDraftNumber(monthlySalary))
  const hourlySalary = parseOptionalNumber(form.hourly_salary)
  return hourlySalary === null ? '' : String(roundDraftNumber(hourlySalary * 208))
}

function calculatedDailySalaryValue(form: PayrollForm) {
  const dailySalary = calculatedDailySalary(form)
  return dailySalary === null ? '' : String(roundDraftNumber(dailySalary))
}

function calculatedDailySalary(form: PayrollForm) {
  const monthlySalary = parseOptionalNumber(form.monthly_salary)
  if (monthlySalary !== null) return monthlySalary / 26
  const hourlySalary = parseOptionalNumber(form.hourly_salary)
  return hourlySalary === null ? null : hourlySalary * 8
}

function calculatedHourlySalaryValue(form: PayrollForm) {
  const monthlySalary = parseOptionalNumber(form.monthly_salary)
  if (monthlySalary !== null) return String(roundDraftNumber(monthlySalary / 208))
  const hourlySalary = parseOptionalNumber(form.hourly_salary)
  return hourlySalary === null ? '' : String(roundDraftNumber(hourlySalary))
}

function formatEditableNumber(value: number | null | undefined) {
  const number = Number(value || 0)
  return String(roundDraftNumber(Number.isFinite(number) ? number : 0))
}

function calculatedFrameFinalSalaryValue(form: PayrollForm, employee?: PayrollEmployee) {
  const dailySalary = Number(calculatedDailySalaryValue(form) || 0)
  const hourlySalary = Number(calculatedHourlySalaryValue(form) || 0)
  const workDays = Number(employee?.work_days || 0)
  const overtimeHours = Number(employee?.overtime_hours || 0)
  const bonus = parseNumber(form.bonus, 0)
  const nqPenalty = Number(employee?.nq_penalty || 0)
  const advance = parseNumber(form.advance_or_penalty, 0)
  return String(roundDraftNumber(
    dailySalary * workDays + overtimeHours * hourlySalary * 1.5 + bonus - nqPenalty - advance,
  ))
}

function emptyPayrollForm(): PayrollForm {
  return {
    employee_code: '',
    name: '',
    start_work_note: '',
    monthly_salary: '',
    daily_salary: '',
    hourly_salary: '',
    standard_work_days: '26',
    bonus: '',
    advance_or_penalty: '',
    note: '',
  }
}

function formFromEmployee(employee: PayrollEmployee): PayrollForm {
  const monthlySalary = Number(employee.monthly_salary || 0)
  const hourlySalary = Number(employee.hourly_salary || 0)
  const form = {
    employee_code: employee.employee_code,
    name: employee.name ?? '',
    start_work_note: employee.start_work_note ?? '',
    monthly_salary: monthlySalary > 0 ? String(roundDraftNumber(monthlySalary)) : '',
    daily_salary: '',
    hourly_salary: hourlySalary > 0 ? String(roundDraftNumber(hourlySalary)) : '',
    standard_work_days: '26',
    bonus: employee.bonus ? String(employee.bonus) : '',
    advance_or_penalty: '',
    note: employee.note ?? '',
  }
  return {
    ...form,
    monthly_salary: calculatedMonthlySalaryValue(form),
    daily_salary: calculatedDailySalaryValue(form),
    hourly_salary: calculatedHourlySalaryValue(form),
  }
}

function payrollFieldValue(employee: PayrollEmployee, field: BulkPayrollField) {
  if (field === 'bonus') return String(employee.bonus || 0)
  if (field === 'advance_or_penalty') return String(employee.advance_or_penalty || 0)
  return employee.note ?? ''
}

function isEmptyPayrollFieldValue(value: string, field: BulkPayrollField) {
  if (field === 'note') return !value.trim()
  return Number(value || 0) === 0
}

function payrollPayload(form: PayrollForm, factory: FactoryMode) {
  return {
    factory,
    employee_code: form.employee_code,
    name: form.name,
    start_work_note: form.start_work_note,
    monthly_salary: parseOptionalNumber(calculatedMonthlySalaryValue(form)),
    daily_salary: parseOptionalNumber(calculatedDailySalaryValue(form)),
    hourly_salary: parseOptionalNumber(calculatedHourlySalaryValue(form)),
    standard_work_days: 26,
    bonus: parseNumber(form.bonus, 0),
    advance_or_penalty: parseNumber(form.advance_or_penalty, 0),
    note: form.note,
  }
}

function blockToWorkRows(block: EmployeeBlock, manualChecks: ManualCheck[]): WorkDayRow[] {
  const manualByDay = manualChecks
    .filter((item) => item.employee_code === block.employee_code)
    .reduce<Record<number, string[]>>((acc, item) => {
      acc[item.day] = [...(acc[item.day] ?? []), ...item.messages]
      return acc
    }, {})

  return block.results.map((item) => ({
    day: item.day,
    punches: item.punches,
    work_value: item.work_value,
    missing_count: item.missing_count,
    late_minutes: item.late_minutes,
    manual_checks: manualByDay[item.day] ?? [],
  }))
}

function historyEmployeeToSearchResult(period: HistoryPeriod, employee: HistoryEmployee): HistorySearchResult {
  return {
    period_id: period.id,
    month: period.month,
    year: period.year,
    label: period.label,
    employee_code: employee.employee_code,
    employee_name: employee.employee_name,
    total_hours: employee.total_hours,
    work_days: employee.work_days,
    final_salary: employee.final_salary,
    note: employee.note,
  }
}

function historyDraftFromEmployee(employee: HistoryEmployee): HistoryEmployeeDraft {
  return {
    employee_name: employee.employee_name ?? '',
    hourly_salary: String(employee.hourly_salary ?? 0),
    bonus: String(employee.bonus ?? 0),
    advance_or_penalty: String(employee.advance_or_penalty ?? 0),
    note: employee.note ?? '',
    daily_records: employee.daily_records.map(historyDailyDraftFromRecord),
  }
}

function historyDailyDraftFromRecord(record: HistoryDailyRecord): HistoryDailyDraft {
  return {
    day: record.day,
    punches: record.punches,
    work_value: record.work_value === null ? '' : String(record.work_value),
    missing_count: record.missing_count === null ? '' : String(record.missing_count),
    late_minutes: record.late_minutes === null ? '' : String(record.late_minutes),
    note: [...(record.manual_checks ?? []), ...(record.review_notes ?? [])].join('; '),
  }
}

function getHistoryReviewSummary(detail: HistoryDetail) {
  const rows = detail.employees.flatMap((employee) =>
    employee.daily_records.filter(isHistoryReviewRecord),
  )
  return {
    total: rows.length,
    confirmed: rows.filter((row) => row.review_notes?.length).length,
  }
}

function getHistoryReviewRows(
  detail: HistoryDetail,
  drafts: Record<string, HistoryEmployeeDraft>,
  baselineDrafts: Record<string, HistoryEmployeeDraft>,
) {
  return detail.employees.flatMap((employee) => {
    const draft = drafts[employee.employee_code]
    const baseline = baselineDrafts[employee.employee_code]
    if (!draft) return []

    return employee.daily_records
      .filter((record) => {
        const draftRow = draft.daily_records.find((row) => row.day === record.day)
        return isHistoryReviewRecord(record) || Boolean(draftRow && isHistoryDailyIssue(draftRow))
      })
      .map((record) => {
        const draftRow = draft.daily_records.find((row) => row.day === record.day) ?? historyDailyDraftFromRecord(record)
        const baselineRow = baseline?.daily_records.find((row) => row.day === record.day)
        return {
          employeeCode: employee.employee_code,
          day: record.day,
          punches: draftRow.punches,
          draft: draftRow,
          confirmed: Boolean(draftRow.note.trim() || record.review_notes?.length),
          changed: isHistoryDailyChanged(draftRow, baselineRow),
        }
      })
  })
}

function isHistoryReviewRecord(record: HistoryDailyRecord) {
  return Boolean(
    record.review_notes?.length ||
      record.manual_checks?.length ||
      record.missing_count !== null ||
      record.late_minutes !== null,
  )
}

function hasHistoryDraftChanges(draft?: HistoryEmployeeDraft, baseline?: HistoryEmployeeDraft) {
  return Boolean(getChangedHistoryFields(draft ?? null, baseline ?? null).length || getChangedHistoryDailyCount(draft ?? null, baseline ?? null))
}

function getChangedHistoryFields(
  draft: HistoryEmployeeDraft | null,
  baseline: HistoryEmployeeDraft | null,
): HistoryEditableField[] {
  if (!draft || !baseline) return []
  const fields: HistoryEditableField[] = [
    'employee_name',
    'hourly_salary',
    'bonus',
    'advance_or_penalty',
    'note',
  ]
  return fields.filter((field) => draft[field] !== baseline[field])
}

function getChangedHistoryDailyCount(draft: HistoryEmployeeDraft | null, baseline: HistoryEmployeeDraft | null) {
  if (!draft || !baseline) return 0
  return draft.daily_records.filter((row) => {
    const baselineRow = baseline.daily_records.find((item) => item.day === row.day)
    return isHistoryDailyChanged(row, baselineRow)
  }).length
}

function isHistoryDailyChanged(row: HistoryDailyDraft, baseline?: HistoryDailyDraft) {
  if (!baseline) return true
  return (
    row.work_value !== baseline.work_value ||
    row.missing_count !== baseline.missing_count ||
    row.late_minutes !== baseline.late_minutes ||
    row.note !== baseline.note
  )
}

function isHistoryDailyIssue(row: HistoryDailyDraft) {
  return Boolean(row.missing_count.trim() || row.late_minutes.trim() || row.note.trim())
}

function baselineDailyRow(employee: HistoryEmployee, day: number) {
  const record = employee.daily_records.find((item) => item.day === day)
  return record ? historyDailyDraftFromRecord(record) : undefined
}

function calculateHistoryOutput2(draft: HistoryEmployeeDraft, employee?: HistoryEmployee) {
  const totalHours = draft.daily_records.reduce((total, row) => total + numericDraftValue(row.work_value), 0)
  const workDays = totalHours / 8
  const hourlySalary =
    numericDraftValue(draft.hourly_salary) > 0
      ? numericDraftValue(draft.hourly_salary)
      : Number(employee?.hourly_salary || 0) > 0
        ? Number(employee?.hourly_salary || 0)
      : Number(employee?.daily_salary || 0) > 0
        ? Number(employee?.daily_salary || 0) / 8
        : totalHours > 0
          ? Number(employee?.final_salary || 0) / totalHours
          : 0
  const baseSalary = totalHours * hourlySalary
  const dailySalary = hourlySalary * 8
  const monthlySalary = dailySalary * 26
  const finalSalary = baseSalary + parseNumber(draft.bonus, 0) - parseNumber(draft.advance_or_penalty, 0)
  return {
    totalHours: roundDraftNumber(totalHours),
    workDays: roundDraftNumber(workDays),
    hourlySalary: roundDraftNumber(hourlySalary),
    dailySalary: roundDraftNumber(dailySalary),
    monthlySalary: roundDraftNumber(monthlySalary),
    baseSalary: roundDraftNumber(baseSalary),
    finalSalary: roundDraftNumber(finalSalary),
  }
}

function numericDraftValue(value: string) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function roundDraftNumber(value: number) {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? Math.trunc(rounded) : rounded
}

function historyFieldStatus(
  field: HistoryEditableField,
  changedFields: HistoryEditableField[],
  savedFields: HistoryEditableField[],
  errorFields: HistoryEditableField[],
) {
  if (errorFields.includes(field)) return 'edit-error'
  if (savedFields.includes(field)) return 'edit-saved'
  if (changedFields.includes(field)) return 'edit-dirty'
  return ''
}

function isEmployeeProfileEntered(employee: PayrollEmployee) {
  return Boolean((employee.name ?? '').trim())
}

function sortEmployeesForEntry(employees: PayrollEmployee[]) {
  return [...employees].sort((left, right) => {
    const leftEntered = isEmployeeProfileEntered(left)
    const rightEntered = isEmployeeProfileEntered(right)
    if (leftEntered !== rightEntered) {
      return leftEntered ? -1 : 1
    }
    return compareEmployeeCode(left.employee_code, right.employee_code)
  })
}

function sortEmployeesByCode(employees: PayrollEmployee[]) {
  return [...employees].sort((left, right) => compareEmployeeCode(left.employee_code, right.employee_code))
}

function mergeEmployeeLists(registry: PayrollEmployee[], currentPayroll: PayrollEmployee[]) {
  const merged = new Map<string, PayrollEmployee>()
  for (const employee of currentPayroll) {
    if (employee.employee_code) merged.set(employee.employee_code, employee)
  }
  for (const employee of registry) {
    if (!employee.employee_code) continue
    const current = merged.get(employee.employee_code)
    // The registry is the profile source, while the current Output 2 supplies
    // work hours and rows that have not yet been stored as a profile.
    merged.set(employee.employee_code, current ? { ...current, ...employee } : employee)
  }
  return sortEmployeesByCode([...merged.values()])
}

function filterEmployeesByMonth(
  employees: PayrollEmployee[],
  overview: AttendanceOverview | null,
  year: string,
  month: string,
  fallbackToAllWhenNoMonthData = false,
) {
  const selectedYear = parseOptionalNumber(year)
  const selectedMonth = parseOptionalNumber(month)
  if (!selectedYear || !selectedMonth || !overview || overview.year !== selectedYear) {
    return employees
  }

  const activeCodes = new Set(
    overview.employees
      .filter((employee) => {
        const monthItem = employee.months[selectedMonth - 1]
        return monthItem && (Number(monthItem.work_days || 0) > 0 || Number(monthItem.total_hours || 0) > 0)
      })
      .map((employee) => employee.employee_code),
  )

  if (!activeCodes.size && fallbackToAllWhenNoMonthData) {
    return employees
  }

  return employees.filter((employee) => activeCodes.has(employee.employee_code))
}

function isSamePeriod(year: string, month: string, period: PeriodInfo) {
  return Number(year) === Number(period.year || 0) && Number(month) === Number(period.month || 0)
}

function isAnalyzedPeriodNewest(current: PeriodInfo, latest: HistoryPeriod | null) {
  if (!current.month || !current.year || !latest) return true
  if (current.year !== latest.year) return current.year > latest.year
  return current.month >= latest.month
}

function employeeNoveltyForPeriod(
  employeeCode: string,
  current: PeriodInfo,
  latest: LatestHistoryInfo,
  knownHistoryCodes: string[],
): EmployeeNovelty | undefined {
  if (!isAnalyzedPeriodNewest(current, latest.period)) return undefined
  if (latest.employee_codes.includes(employeeCode)) return undefined
  return knownHistoryCodes.includes(employeeCode) ? 'returning' : 'first-time'
}

function compareEmployeeCode(left: string, right: string) {
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber
  }
  return left.localeCompare(right, 'vi')
}

function buildPayrollReviewItems(
  data: AnalyzeResponse,
  latestHistoryInfo: LatestHistoryInfo,
  knownHistoryCodes: string[],
  reviewMemory: ReviewMemory | null,
): PayrollReviewItem[] {
  const manualByEmployeeDay = data.manual_checks.reduce<Record<string, string[]>>((acc, item) => {
    const key = `${item.employee_code}-${item.day}`
    acc[key] = [...(acc[key] ?? []), ...item.messages]
    return acc
  }, {})
  const memoryByEmployeeDay = (reviewMemory?.records ?? []).reduce<Record<string, ReviewMemoryRecord>>((acc, item) => {
    acc[reviewKey(item.employee_code, item.day)] = item
    return acc
  }, {})
  const historyPeriodLabel = reviewMemory?.period?.label ?? ''
  const firstWorkDays = firstWorkDaysByEmployee(data)

  return data.blocks.flatMap((block) =>
    block.results.flatMap((result) => {
      const messages = manualByEmployeeDay[`${block.employee_code}-${result.day}`] ?? []
      const history = memoryByEmployeeDay[reviewKey(block.employee_code, result.day)]
      const historyMatchesPunches = history ? samePunches(history.punches, result.punches) : false
      const defaultWorkValue = result.work_value === null ? 0 : result.work_value
      const novelty = employeeNoveltyForPeriod(block.employee_code, data.period, latestHistoryInfo, knownHistoryCodes)
      const isNewcomerFirstWorkDay = Boolean(novelty) && firstWorkDays[block.employee_code] === result.day
      const hideZeroWorkReview = Number(defaultWorkValue) === 0 && !isNewcomerFirstWorkDay
      const base = {
        employee_code: block.employee_code,
        novelty,
        day: result.day,
        punches: result.punches,
        messages,
        original_work_value: defaultWorkValue,
        work_value: String(defaultWorkValue),
        status: 'pending' as PayrollReviewStatus,
      }
      const items: PayrollReviewItem[] = []
      if (result.newcomer_benefit) {
        items.push({
          ...base,
          id: `newcomer-benefit-${block.employee_code}-${result.day}`,
          type: 'newcomer_benefit',
          original_value: 'Đã cộng',
          value: 'Đã cộng',
          messages: [...messages, result.newcomer_benefit],
        })
      }
      if (result.missing_count === '?' && !hideZeroWorkReview) {
        items.push({
          ...base,
          id: `missing-${block.employee_code}-${result.day}`,
          type: 'missing',
          original_value: result.missing_count,
          value: String(result.missing_count),
        })
      }
      if (result.missing_count === null && !hideZeroWorkReview && messages.includes('Không đủ cặp giờ để tính công')) {
        items.push({
          ...base,
          id: `missing-incomplete-pair-${block.employee_code}-${result.day}`,
          type: 'missing',
          original_value: '?',
          value: '?',
        })
      }
      if (result.late_minutes !== null && result.missing_count === '?' && !hideZeroWorkReview) {
        items.push({
          ...base,
          id: `late-${block.employee_code}-${result.day}`,
          type: 'late',
          original_value: result.late_minutes,
          value: String(result.late_minutes),
        })
      }
      if (history && historyMatchesPunches && !sameReviewValue(history.work_value, result.work_value)) {
        items.push({
          ...base,
          id: `rule-change-${block.employee_code}-${result.day}`,
          type: 'rule_change',
          original_value: history.work_value ?? '',
          original_work_value: history.work_value,
          value: history.work_value === null || history.work_value === undefined ? '' : String(history.work_value),
          history_value: history.work_value,
          history_work_value: history.work_value,
          history_review_notes: history.review_notes,
          history_period_label: historyPeriodLabel,
          origin: 'rule-changed',
        })
      }
      return items.map((item) => applyReviewMemory(item, history, historyMatchesPunches, historyPeriodLabel))
    }),
  )
}

function reconcileTemporaryReviewItems(
  data: AnalyzeResponse,
  latestHistoryInfo: LatestHistoryInfo,
  knownHistoryCodes: string[],
  reviewMemory: ReviewMemory | null,
  savedItems: PayrollReviewItem[],
  recalculated = false,
): PayrollReviewItem[] {
  const derivedItems = buildPayrollReviewItems(data, latestHistoryInfo, knownHistoryCodes, reviewMemory)
  const savedById = new Map(savedItems.map((item) => [item.id, item]))

  return derivedItems.map((derivedItem) => {
    const savedItem = savedById.get(derivedItem.id)
    if (!savedItem) return derivedItem
    if (recalculated) {
      const valueChanged = String(savedItem.value ?? '') !== String(savedItem.original_value ?? '')
      const workValueChanged = String(savedItem.work_value ?? '') !== String(savedItem.original_work_value ?? '')
      if (!valueChanged && !workValueChanged) {
        return {
          ...derivedItem,
          status: savedItem.status,
          pair_selected: savedItem.pair_selected,
        }
      }
      return {
        ...derivedItem,
        value: valueChanged ? savedItem.value : derivedItem.value,
        work_value: workValueChanged ? savedItem.work_value : derivedItem.work_value,
        status: savedItem.status,
      }
    }
    return {
      ...derivedItem,
      value: savedItem.value,
      // Older unfinished sessions stored an uncomputable work value as an
      // empty string. Migrate only that legacy blank to the new default 0;
      // preserve every value the user actually entered.
      work_value:
        derivedItem.work_value === '0' && String(savedItem.work_value ?? '').trim() === ''
          ? '0'
          : savedItem.work_value,
      status: savedItem.status,
      pair_selected: savedItem.pair_selected,
    }
  })
}

function applyReviewMemory(
  item: PayrollReviewItem,
  history: ReviewMemoryRecord | undefined,
  historyMatchesPunches: boolean,
  historyPeriodLabel: string,
): PayrollReviewItem {
  if (!history || !historyMatchesPunches || item.type === 'rule_change' || item.type === 'newcomer_benefit' || !history.review_notes.length) {
    return item
  }

  const status: PayrollReviewStatus = history.review_notes.some((note) => normalizeText(note).includes('sua'))
    ? 'edited'
    : 'ok'
  if (item.type === 'missing') {
    return {
      ...item,
      status,
      value: history.missing_count === null || history.missing_count === undefined ? '' : String(history.missing_count),
      work_value: history.work_value === null || history.work_value === undefined ? item.work_value : String(history.work_value),
      history_value: history.missing_count,
      history_work_value: history.work_value,
      history_review_notes: history.review_notes,
      history_period_label: historyPeriodLabel,
      origin: 'history-applied',
    }
  }

  return {
    ...item,
    status,
    value: history.late_minutes === null || history.late_minutes === undefined ? '' : String(history.late_minutes),
    work_value: history.work_value === null || history.work_value === undefined ? item.work_value : String(history.work_value),
    history_value: history.late_minutes,
    history_work_value: history.work_value,
    history_review_notes: history.review_notes,
    history_period_label: historyPeriodLabel,
    origin: 'history-applied',
  }
}

function reviewKey(employeeCode: string, day: number) {
  return `${employeeCode}-${day}`
}

function samePunches(left: string[], right: string[]) {
  return [...left].sort().join('|') === [...right].sort().join('|')
}

function sameReviewValue(left: unknown, right: unknown) {
  return String(left ?? '') === String(right ?? '')
}

function hasReviewDraftChanges(item: PayrollReviewItem) {
  return item.value !== String(item.original_value ?? '') || item.work_value !== String(item.original_work_value ?? '')
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function buildReviewOverrides(items: PayrollReviewItem[]) {
  const byDay = new Map<
    string,
    {
      employee_code: string
      day: number
      type?: PayrollReviewType
      status?: PayrollReviewStatus
      review_notes?: string[]
      missing_count?: number | string | null
      late_minutes?: number | null
      work_value?: number | string | null
    }
  >()
  for (const item of items) {
    if (item.status === 'pending') {
      continue
    }

    const key = `${item.employee_code}-${item.day}`
    const target = byDay.get(key) ?? { employee_code: item.employee_code, day: item.day, review_notes: [] }
    target.type = item.type
    target.status = item.status
    target.review_notes = [...(target.review_notes ?? []), `${reviewStatusLabel(item.status)}: ${reviewTypeLabel(item.type)}`]
    if (item.type === 'missing') {
      target.missing_count = parseReviewValue(item.value)
    } else if (item.type === 'late') {
      const parsed = parseReviewValue(item.value)
      target.late_minutes = typeof parsed === 'number' ? parsed : null
    }
    target.work_value = parseReviewValue(item.work_value)
    byDay.set(key, target)
  }
  return Array.from(byDay.values())
}

function parseReviewValue(value: string) {
  const text = value.trim()
  if (!text) return null
  const numeric = Number(text)
  return Number.isFinite(numeric) ? numeric : text
}

function reviewStatusLabel(status: PayrollReviewStatus) {
  if (status === 'ok') return 'Đã OK'
  if (status === 'edited') return 'Đã sửa'
  return 'Chưa xác nhận'
}

function reviewTypeLabel(type: PayrollReviewType) {
  if (type === 'missing') return 'Quên bấm / chưa rõ'
  if (type === 'late') return 'Đi trễ'
  if (type === 'newcomer_benefit') return 'Ca tự cộng nhân viên mới'
  return 'Đổi công do rule'
}

function totalBlockHours(block: EmployeeBlock) {
  return block.results.reduce((total, item) => {
    return total + (typeof item.work_value === 'number' ? item.work_value : 0)
  }, 0)
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeEmployeeName(value: string) {
  return value
    .replace(/[Đđ]/g, (character) => (character === 'đ' ? 'd' : 'D'))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function parseNumber(value: string, fallback: number) {
  if (!value.trim()) return fallback
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function cleanParams(params: Record<string, string>) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value.trim() !== ''))
}

function latestSavedSourceByMonth<T extends HistoryPeriod | HistoryFinalCopy>(items: T[]): T[] {
  const latest = new Map<string, T>()
  for (const item of items) {
    const key = `${item.year}-${item.month}`
    const current = latest.get(key)
    if (!current || savedSourceTimestamp(item) > savedSourceTimestamp(current)) {
      latest.set(key, item)
    }
  }
  return Array.from(latest.values()).sort(
    (left, right) =>
      right.year - left.year ||
      right.month - left.month ||
      savedSourceTimestamp(right).localeCompare(savedSourceTimestamp(left)),
  )
}

function savedSourceTimestamp(item: HistoryPeriod | HistoryFinalCopy): string {
  return 'created_at' in item ? item.created_at || '' : item.modified_at || ''
}

function formatMoney(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('vi-VN')
}

function formatNumber(value: number | string) {
  if (typeof value === 'string') return value
  return Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })
}

function formatNullable(value: number | string | null) {
  if (value === null || value === undefined || value === '') return ''
  return typeof value === 'number' ? formatNumber(value) : value
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateTimeShort(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatSubmissionSource(value: string) {
  return value.replace(/^\[STAFF_SUBMISSION\]\s*/, '')
}

function readMappingSummary(value: unknown): MappingSummary | null {
  if (typeof value !== 'string' || !value) return null
  try {
    return JSON.parse(value) as MappingSummary
  } catch {
    return null
  }
}

function mappingSummaryMessage(summary: MappingSummary | null) {
  if (!summary) return 'Đã gán dữ liệu và tải file kết quả.'
  const newCodes = compactCodeList(summary.new_codes)
  const inactiveCodes = compactCodeList(summary.inactive_codes)
  const reviewCodes = compactCodeList(summary.deduction_review_codes)
  const bankMessage = summary.bank_accounts_saved
    ? `Đã lưu ${summary.bank_accounts_saved} tài khoản mới${summary.bank_backup_status === 'saved_to_drive' ? ' và sao lưu lên Drive' : ' trên máy'}.`
    : summary.bank_missing_count
      ? `Còn ${summary.bank_missing_count} mã chưa có tài khoản trong kho Ngân hàng.`
      : ''
  return [
    `Đã gán dữ liệu: ${summary.matched_count} mã khớp.`,
    `Tháng mới có ${summary.new_count} mã mới${newCodes ? ` (${newCodes})` : ''}.`,
    `File cũ có ${summary.inactive_count} mã không còn trong tháng mới${inactiveCodes ? ` (${inactiveCodes})` : ''}.`,
    summary.deduction_review_count
      ? `${summary.deduction_review_count} mã có ứng/phạt tháng cũ đã được để trống và đánh dấu ?${reviewCodes ? ` (${reviewCodes})` : ''}.`
      : 'Không có khoản ứng/phạt cũ cần đánh dấu.',
    bankMessage,
  ].join(' ')
}

function compactCodeList(codes?: string[]) {
  if (!codes?.length) return ''
  const visible = codes.slice(0, 8)
  return codes.length > visible.length ? `${visible.join(', ')}...` : visible.join(', ')
}

function safeFilename(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'lich_su'
}

function readablePeriodExportFilename(
  factory: FactoryMode | undefined,
  period: Pick<PeriodInfo, 'month' | 'year'> | null | undefined,
  content: string,
  extension: string,
) {
  const factoryLabel = factory === 'factory2' ? 'Xuong2' : 'Xuong1'
  const periodLabel =
    period?.month && period?.year
      ? `${period.year}-${String(period.month).padStart(2, '0')}`
      : 'KhongRoKy'
  return `${factoryLabel}_${periodLabel}_${content}.${extension}`
}

function readableSourceExportFilename(
  factory: FactoryMode | undefined,
  sourceFilename: string,
  content: string,
  extension: string,
) {
  const factoryLabel = factory === 'factory2' ? 'Xuong2' : 'Xuong1'
  const sourceStem = sourceFilename.replace(/\.[^.]+$/, '')
  return `${factoryLabel}_${safeFilename(sourceStem)}_${content}.${extension}`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  // Keep the object URL alive long enough for Chromium/Edge to start the
  // download. Revoking it immediately can leave the success toast visible
  // while no file is actually written to Downloads.
  window.setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(url)
  }, 1500)
}

function downloadFromUrl(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  window.setTimeout(() => link.remove(), 1500)
}

function withDownloadToken(url: string, token: string) {
  const target = new URL(url)
  target.searchParams.set('token', token)
  return target.toString()
}

function setAuthToken(token: string) {
  axios.defaults.headers.common.Authorization = `Bearer ${token}`
}

function clearAuthToken() {
  delete axios.defaults.headers.common.Authorization
}

function readSmartSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SMART_SETTINGS_KEY) ?? '{}') as {
      smartScan?: boolean
      smartMapping?: boolean
      newcomerBenefit?: boolean
      showNewcomerBenefitReview?: boolean
      showWorkDetail?: boolean
      showManualChecks?: boolean
      showEmployeeList?: boolean
      manualEntryLocked?: boolean
      legacyConverter?: boolean
      factory2LegacyConverter?: boolean
    }
    return {
      smartScan: saved.smartScan ?? true,
      smartMapping: saved.smartMapping ?? true,
      newcomerBenefit: saved.newcomerBenefit ?? false,
      showNewcomerBenefitReview: saved.showNewcomerBenefitReview ?? true,
      showWorkDetail: saved.showWorkDetail ?? true,
      showManualChecks: saved.showManualChecks ?? true,
      showEmployeeList: saved.showEmployeeList ?? true,
      manualEntryLocked: saved.manualEntryLocked ?? false,
      legacyConverter: saved.legacyConverter ?? saved.factory2LegacyConverter ?? false,
    }
  } catch {
    return {
      smartScan: true,
      smartMapping: true,
      newcomerBenefit: false,
      showNewcomerBenefitReview: true,
      showWorkDetail: true,
      showManualChecks: true,
      showEmployeeList: true,
      manualEntryLocked: false,
      legacyConverter: false,
    }
  }
}

function isExcelFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return lowerName.endsWith('.xlsx') || lowerName.endsWith('.xlsm')
}

function isLegacyExcelFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return lowerName.endsWith('.xls') || isExcelFile(file)
}

function readAxiosError(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (detail && typeof detail === 'object') return JSON.stringify(detail)
    return err.message || fallback
  }
  if (err instanceof Error) {
    return err.message
  }
  return fallback
}

async function readAxiosErrorAsync(err: unknown, fallback: string) {
  if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
    try {
      const payload = JSON.parse(await err.response.data.text()) as { detail?: unknown }
      if (typeof payload.detail === 'string') return payload.detail
      if (payload.detail) return JSON.stringify(payload.detail)
    } catch {
      return fallback
    }
  }
  return readAxiosError(err, fallback)
}

export default App
