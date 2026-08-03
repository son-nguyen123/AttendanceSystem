import { useEffect, useState } from 'react'
import axios from 'axios'
import './App.css'

const API_BASE = 'http://127.0.0.1:8000/api'
const ROLE_LOGIN_ENABLED = false
const SMART_SETTINGS_KEY = 'attendance-smart-settings'

type Summary = {
  blocks: number
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

type FactoryMode = 'factory1' | 'factory2'

type PeriodInfo = {
  month: number | null
  year: number | null
  label: string
}

type PayrollEmployee = {
  employee_code: string
  name: string
  start_work_note: string
  note: string
  total_hours: number
  monthly_salary: number | null
  daily_salary_input: number | null
  daily_salary: number
  hourly_salary: number
  standard_work_days: number
  work_days: number
  bonus: number
  advance_or_penalty: number
  final_salary: number
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
  matched_codes?: string[]
  new_codes?: string[]
  inactive_codes?: string[]
  deduction_review_codes?: string[]
}

type WorkDayRow = {
  day: number
  punches: string[]
  work_value: number | string | null
  missing_count: number | string | null
  late_minutes: number | null
  manual_checks: string[]
}

type PayrollReviewType = 'missing' | 'late' | 'rule_change'
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
  saved_at: string
  factory: FactoryMode
  data: AnalyzeResponse
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

function App() {
  const [auth, setAuth] = useState<AuthSession | null>(null)
  const [authLoading, setAuthLoading] = useState(ROLE_LOGIN_ENABLED)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginForm, setLoginForm] = useState<LoginForm>({ email: '', password: '' })
  const [file, setFile] = useState<File | null>(null)
  const [factoryMode, setFactoryMode] = useState<FactoryMode>('factory1')
  const [recalculateFile, setRecalculateFile] = useState<File | null>(null)
  const [mappingCurrentFile, setMappingCurrentFile] = useState<File | null>(null)
  const [mappingPreviousFile, setMappingPreviousFile] = useState<File | null>(null)
  const [finalCopyFile, setFinalCopyFile] = useState<File | null>(null)
  const [finalCopyMonth, setFinalCopyMonth] = useState('')
  const [finalCopyYear, setFinalCopyYear] = useState('')
  const [finalCopyInspecting, setFinalCopyInspecting] = useState(false)
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
  const [recalculateLoading, setRecalculateLoading] = useState(false)
  const [mappingLoading, setMappingLoading] = useState(false)
  const [recalculateOutputKind, setRecalculateOutputKind] = useState<'output1' | 'output2'>('output1')
  const [output1Loading, setOutput1Loading] = useState(false)
  const [payrollLoading, setPayrollLoading] = useState(false)
  const [output2ChoiceOpen, setOutput2ChoiceOpen] = useState(false)
  const [pendingFactorySwitch, setPendingFactorySwitch] = useState<FactoryMode | null>(null)
  const [smartSettingsOpen, setSmartSettingsOpen] = useState(false)
  const [smartScanEnabled, setSmartScanEnabled] = useState(() => readSmartSettings().smartScan)
  const [smartMappingEnabled, setSmartMappingEnabled] = useState(() => readSmartSettings().smartMapping)
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
    backup_on_history_change: true,
  })
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const pendingReviewCount = payrollReviewItems.filter((item) => item.status === 'pending').length
  const currentReviewTableName = 'bảng kiểm tra Output'
  const isOwner = !ROLE_LOGIN_ENABLED || auth?.user.role === 'owner'

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
    if (!ROLE_LOGIN_ENABLED || auth?.user.role === 'owner') {
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

  useEffect(() => {
    if (ROLE_LOGIN_ENABLED && !auth) return
    let cancelled = false

    async function restoreTemporaryWorkspace() {
      let finishHydration = true
      try {
        localStorage.removeItem('attendance-temporary-workspace-v1')
        const workspaceResponse = await axios.get<TemporaryWorkspace>(`${API_BASE}/attendance/temporary-workspace`)
        const workspace = workspaceResponse.data
        if (workspace.version !== 1 || !workspace.data?.session_id || workspace.factory !== workspace.data.factory) {
          throw new Error('Phiên tạm không hợp lệ')
        }

        const response = await axios.get<{ employees: PayrollEmployee[] }>(`${API_BASE}/payroll/employees`, {
          params: { session_id: workspace.data.session_id },
        })
        if (cancelled) return

        const employees = response.data.employees
        const selectedEmployee =
          employees.find((employee) => employee.employee_code === workspace.selected_code) ?? employees[0]
        setFactoryMode(workspace.factory)
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
        setPayrollEmployees(employees)
        setSelectedCode(selectedEmployee?.employee_code ?? '')
        setForm(selectedEmployee ? formFromEmployee(selectedEmployee) : emptyPayrollForm())
        setActiveView(workspace.active_view === 'payroll' ? 'payroll' : 'attendance')
        setPeriodMonth(workspace.period_month ?? '')
        setPeriodYear(workspace.period_year ?? '')
        setEmployeeListMonth(workspace.employee_list_month ?? '')
        setEmployeeListYear(workspace.employee_list_year ?? '')
        setRestoredAnalysisFilename(workspace.data.filename)
        setMessage(`Đã khôi phục phiên tạm đang làm dở: ${workspace.data.filename}`)
      } catch (error) {
        const backendUnavailable = axios.isAxiosError(error) && !error.response
        const noTemporaryWorkspace = axios.isAxiosError(error) && error.response?.status === 404
        if (backendUnavailable) {
          finishHydration = false
          if (!cancelled) setMessage('Backend chưa sẵn sàng để khôi phục phiên tạm. Hãy tải lại trang sau vài giây.')
        } else if (!noTemporaryWorkspace) {
          void axios.delete(`${API_BASE}/attendance/temporary-workspace`).catch(() => undefined)
          if (!cancelled) setMessage('Phiên tạm cũ không còn dữ liệu nguồn nên đã được dọn khỏi máy.')
        }
      } finally {
        if (!cancelled && finishHydration) setWorkspaceHydrated(true)
      }
    }

    void restoreTemporaryWorkspace()
    return () => {
      cancelled = true
    }
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
    if (!data) {
      void axios.delete(`${API_BASE}/attendance/temporary-workspace`).catch(() => undefined)
      return
    }

    const workspace: TemporaryWorkspace = {
      version: 1,
      saved_at: new Date().toISOString(),
      factory: data.factory ?? factoryMode,
      data,
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
    const saveTimer = window.setTimeout(() => {
      void axios.put(`${API_BASE}/attendance/temporary-workspace`, workspace).catch(() => undefined)
    }, 180)
    return () => window.clearTimeout(saveTimer)
  }, [
    activeView,
    data,
    employeeListMonth,
    employeeListYear,
    factoryMode,
    knownHistoryCodes,
    latestHistoryInfo,
    payrollReviewItems,
    periodMonth,
    periodYear,
    reviewMemory,
    selectedCode,
    workspaceHydrated,
  ])

  useEffect(() => {
    if (ROLE_LOGIN_ENABLED && auth?.user.role !== 'owner') return
    void loadHistoryPeriods()
    void loadAttendanceOverview(attendanceOverviewYear)
    void fetchKnownHistoryCodes().then(setKnownHistoryCodes).catch(() => setKnownHistoryCodes([]))
    // Factory switching is the trigger; including loader functions would retrigger this effect every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factoryMode])

  useEffect(() => {
    localStorage.setItem(
      SMART_SETTINGS_KEY,
      JSON.stringify({ smartScan: smartScanEnabled, smartMapping: smartMappingEnabled }),
    )
  }, [smartScanEnabled, smartMappingEnabled])

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
    void axios.delete(`${API_BASE}/attendance/temporary-workspace`).catch(() => undefined)
    if (!keepSelectedFile) setFile(null)
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
      !window.confirm(
        `Bạn đang có một phiên phân tích tạm chưa lưu vào lịch sử.\n\n` +
          `Chọn file mới sẽ bỏ toàn bộ phần đang làm dở của ${data.filename}. Bạn có muốn tiếp tục?`,
      )
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

  async function analyze() {
    if (!file) return

    if (
      data &&
      !window.confirm(
        `Phân tích lại sẽ thay thế phiên tạm đang làm dở của ${data.filename}.\n\n` +
          `Bạn có muốn bỏ phiên hiện tại và tiếp tục không?`,
      )
    ) {
      return
    }
    if (data) clearTemporaryAnalysis(true)

    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const [latestInfo, knownCodes] = await Promise.all([
        fetchLatestHistoryInfo(),
        fetchKnownHistoryCodes(),
      ])
      let response = await postAnalyze(false)
      let responseData = response.data

      if (isNormalizationRequired(responseData)) {
        const retainedCount = responseData.retained_employee_count ?? responseData.raw_employee_count
        const discardedCount = responseData.discarded_empty_employee_count ?? 0
        const filterLine = discardedCount
          ? `App sẽ giữ ${retainedCount} mã có giờ chấm công và bỏ ${discardedCount} mã rỗng.\n\n`
          : ''
        const shouldNormalize = window.confirm(
          `Phát hiện file raw từ máy chấm công, chưa có khung nhập phân tích.\n\n` +
            `App cần tự động bổ sung khung cho ${responseData.raw_employee_count} mã nhân viên trước khi phân tích.\n\n` +
            filterLine +
            `Bạn có muốn bổ sung khung và tiếp tục phân tích không?`,
        )

        if (!shouldNormalize) {
          setMessage('Đã hủy phân tích vì file raw chưa có khung nhập.')
          return
        }

        response = await postAnalyze(true)
        responseData = response.data
      }

      if (isNormalizationRequired(responseData)) {
        setError('File vẫn chưa có khung nhập sau bước chuẩn hóa.')
        return
      }

      setLatestHistoryInfo(latestInfo)
      setKnownHistoryCodes(knownCodes)
      const memory = await fetchReviewMemory(responseData.period)
      const reviewItems = buildPayrollReviewItems(responseData, latestInfo, knownCodes, memory)
      setReviewMemory(memory)
      setData(responseData)
      setPayrollReviewItems(reviewItems)
      setReviewSourceSessionId(responseData.session_id)
      setRestoredAnalysisFilename(responseData.filename)
      setPeriodMonth(responseData.period?.month ? String(responseData.period.month) : '')
      setPeriodYear(responseData.period?.year ? String(responseData.period.year) : '')
      setEmployeeListMonth(responseData.period?.month ? String(responseData.period.month) : '')
      setEmployeeListYear(responseData.period?.year ? String(responseData.period.year) : '')
      setActiveView('attendance')
      if (isOwner) {
        await refreshPayroll(responseData.session_id)
      }
      const infoMessages: string[] = []
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
      setError(readAxiosError(err, 'Không phân tích được file'))
    } finally {
      setLoading(false)
    }
  }

  function postAnalyze(normalizeRaw: boolean) {
    if (!file) throw new Error('Chưa chọn file Excel')

    const uploadForm = new FormData()
    uploadForm.append('file', file)
    uploadForm.append('normalize_raw', String(normalizeRaw))
    uploadForm.append('factory', factoryMode)
    uploadForm.append('smart_scan', String(smartScanEnabled))
    return axios.post<AnalyzeResponse | NormalizationRequiredResponse>(`${API_BASE}/attendance/analyze`, uploadForm)
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
      const response = await axios.post(`${API_BASE}/attendance/map-owner-data`, uploadForm, {
        responseType: 'blob',
      })
      downloadBlob(
        response.data,
        readableSourceExportFilename(factoryMode, mappingCurrentFile.name, 'Output1_Output2', 'zip'),
      )
      const summary = readMappingSummary(response.headers['x-mapping-summary'])
      setMessage(mappingSummaryMessage(summary))
    } catch (err) {
      setError(await readAxiosErrorAsync(err, 'Không gán được dữ liệu'))
    } finally {
      setMappingLoading(false)
    }
  }

  function isNormalizationRequired(
    response: AnalyzeResponse | NormalizationRequiredResponse,
  ): response is NormalizationRequiredResponse {
    return 'requires_normalization' in response && response.requires_normalization === true
  }

  async function refreshPayroll(sessionId = data?.session_id, syncSelection = true) {
    if (!sessionId) return

    const response = await axios.get<{ employees: PayrollEmployee[] }>(`${API_BASE}/payroll/employees`, {
      params: { session_id: sessionId },
    })
    const employees = response.data.employees
    setPayrollEmployees(employees)
    if (!syncSelection) return

    const nextEmployee =
      employees.find((employee) => employee.employee_code === selectedCode) ?? employees[0]
    setSelectedCode(nextEmployee?.employee_code ?? '')
    setForm(nextEmployee ? formFromEmployee(nextEmployee) : emptyPayrollForm())
  }

  async function loadEmployeeRegistry(selectCode = selectedCode) {
    const response = await axios.get<{ employees: PayrollEmployee[] }>(`${API_BASE}/payroll/employees`)
    const employees = response.data.employees
    setEmployeeRegistry(employees)
    if (!data) {
      const nextEmployee = employees.find((employee) => employee.employee_code === selectCode) ?? employees[0]
      setSelectedCode(nextEmployee?.employee_code ?? '')
      setForm(nextEmployee ? formFromEmployee(nextEmployee) : emptyPayrollForm())
    }
  }

  async function fetchLatestHistoryInfo() {
    const response = await axios.get<LatestHistoryInfo>(`${API_BASE}/history/latest-period`, {
      params: { factory: factoryMode },
    })
    return response.data
  }

  async function fetchKnownHistoryCodes() {
    const response = await axios.get<{ employee_codes: string[] }>(`${API_BASE}/history/employee-codes`, {
      params: { factory: factoryMode },
    })
    return response.data.employee_codes
  }

  async function fetchReviewMemory(period: PeriodInfo): Promise<ReviewMemory | null> {
    if (!period.month || !period.year) return null
    const response = await axios.get<ReviewMemory>(`${API_BASE}/history/review-memory`, {
      params: { month: period.month, year: period.year, factory: factoryMode },
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
    clearTemporaryAnalysis()
    setMappingCurrentFile(null)
    setMappingPreviousFile(null)
    setRecalculateFile(null)
    setFinalCopyFile(null)
    setFactoryMode(nextMode)
    setHistoryPeriods([])
    setHistoryFinalCopies([])
    setHistoryDetail(null)
    setHistorySearchResults([])
    setSelectedPeriodId('')
    setSelectedFinalCopyId('')
    setAttendanceOverview(null)
    setCloudSubmissions([])
    setSelectedCode('')
    setError(null)
    setMessage(null)
    setActiveView(isOwner ? 'employees' : 'attendance')
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

  async function savePayroll() {
    if (!form.employee_code) return

    setPayrollLoading(true)
    setError(null)
    setMessage(null)
    try {
      await axios.post(`${API_BASE}/payroll/save`, payrollPayload(form))
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

    setPayrollLoading(true)
    setError(null)
    setMessage(null)
    try {
      await Promise.all(
        updates.map(({ employeeCode, patch }) => {
          const employee = payrollEmployees.find((item) => item.employee_code === employeeCode)
          if (!employee) return Promise.resolve()

          const payload = payrollPayload({ ...formFromEmployee(employee), ...patch })

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
    if (
      pendingReviewCount > 0 &&
      !window.confirm(`Còn ${pendingReviewCount} mục đi trễ/quên bấm/chưa rõ chưa được xác nhận. Bạn có chắc muốn xuất Output 2 không?`)
    ) {
      return
    }

    setOutput2ChoiceOpen(true)
  }

  async function runOutput2Export(includeSavedData: boolean) {
    if (!data) return
    setOutput2ChoiceOpen(false)
    setPayrollLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.post(
        `${API_BASE}/payroll/export-output-2`,
        {
          session_id: data.session_id,
          review_overrides: buildReviewOverrides(payrollReviewItems),
          include_saved_data: includeSavedData,
        },
        {
          responseType: 'blob',
        },
      )
      downloadBlob(
        response.data,
        readablePeriodExportFilename(data.factory ?? factoryMode, data.period, 'Output2', 'xlsx'),
      )
      setMessage(
        data.missing_output1_summary
          ? `Đã xuất Output 2 ${includeSavedData ? 'có dữ liệu đã lưu' : 'chỉ giữ công thức'} và bổ sung vùng cột công/lương bên phải.`
          : `Đã xuất Output 2 ${includeSavedData ? 'có dữ liệu đã lưu' : 'chỉ giữ công thức'}.`,
      )
    } catch (err) {
      setError(readAxiosError(err, 'Không xuất được Output 2'))
    } finally {
      setPayrollLoading(false)
    }
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
      const response = await axios.post<HistoryDetail>(`${API_BASE}/history/save`, {
        session_id: data.session_id,
        month: parseOptionalNumber(periodMonth),
        year: parseOptionalNumber(periodYear),
        review_overrides: buildReviewOverrides(payrollReviewItems),
      })
      setHistoryDetail(response.data)
      setSelectedPeriodId(response.data.period.id)
      setSelectedFinalCopyId('')
      setHistorySelectedCode(response.data.employees[0]?.employee_code ?? '')
      setActiveView('history')
      await loadEmployeeRegistry()
      setKnownHistoryCodes(await fetchKnownHistoryCodes())
      await loadHistoryPeriods()
      setMessage(`Đã lưu lịch sử ${response.data.period.label}`)
    } catch (err) {
      setError(readAxiosError(err, 'Không lưu được lịch sử'))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function loadHistoryPeriods(filters = historyFilters) {
    setHistoryLoading(true)
    try {
      const response = await axios.get<{ periods: HistoryPeriod[] }>(`${API_BASE}/history/periods`, {
        params: cleanParams({ ...filters, factory: factoryMode }),
      })
      const finalResponse = await axios.get<{ final_copies: HistoryFinalCopy[] }>(`${API_BASE}/history/final-copies`, {
        params: cleanParams({ month: filters.month, year: filters.year, factory: factoryMode }),
      })
      setHistoryPeriods(response.data.periods)
      setHistoryFinalCopies(finalResponse.data.final_copies)
    } catch (err) {
      setError(readAxiosError(err, 'Không đọc được lịch sử'))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function loadAttendanceOverview(year = attendanceOverviewYear) {
    setHistoryLoading(true)
    try {
      const response = await axios.get<AttendanceOverview>(`${API_BASE}/history/attendance-overview`, {
        params: cleanParams({ year, factory: factoryMode }),
      })
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
      setError(readAxiosError(err, 'Không đọc được chuyên cần'))
    } finally {
      setHistoryLoading(false)
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
      setPayrollReviewItems(reviewItems)
      setFactoryMode(responseData.factory ?? 'factory1')
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

  async function saveFinalCopy() {
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
      const response = await axios.post<{ path: string; folder: string; profile_sync?: ProfileSyncSummary }>(`${API_BASE}/cloud/final-copy`, uploadForm)
      await loadCloudConfig()
      await loadEmployeeRegistry(selectedCode)
      await loadHistoryPeriods(historyFilters)
      setMessage(`Đã lưu bản sao cuối cùng: ${response.data.path}`)
    } catch (err) {
      setError(readAxiosError(err, 'Không lưu được bản sao cuối cùng'))
    } finally {
      setCloudLoading(false)
    }
  }

  async function selectFinalCopyFile(selectedFile: File | null) {
    setFinalCopyFile(null)
    setFinalCopyMonth('')
    setFinalCopyYear('')
    setError(null)
    setMessage(null)
    if (!selectedFile) return
    const lowerName = selectedFile.name.toLowerCase()
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xlsm')) {
      setError(`File "${selectedFile.name}" không đúng định dạng. Chỉ nhận .xlsx hoặc .xlsm.`)
      return
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
    } catch (err) {
      setError(readAxiosError(err, 'Không đọc được tháng/năm từ file chốt'))
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
      const response = await axios.post<{ path: string; folder: string; final_folder: string; profile_sync?: ProfileSyncSummary }>(`${API_BASE}/cloud/session-copy`, {
        session_id: data.session_id,
        month: Number(periodMonth),
        year: Number(periodYear),
      })
      await loadCloudConfig()
      await loadEmployeeRegistry(selectedCode)
      await loadHistoryPeriods(historyFilters)
      setMessage(`Đã lưu bản đang phân tích vào Drive: ${response.data.path}`)
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

  async function deleteHistoryMonth(month: number, year: number) {
    const label = `Tháng ${month.toString().padStart(2, '0')}/${year}`
    const matchingPeriods = historyPeriods.filter((item) => item.month === month && item.year === year)
    const matchingFinalCopies = historyFinalCopies.filter((item) => item.month === month && item.year === year)
    if (
      !window.confirm(
        `Xóa toàn bộ ${label}?\n\nThao tác này sẽ xóa ${matchingPeriods.length} bản chấm máy trên máy và ${matchingFinalCopies.length ? 'bản sao cuối cùng cùng toàn bộ thư mục tháng trên Drive' : 'thư mục tháng tương ứng trên Drive'}.`,
      )
    ) {
      return
    }
    const deleteCloud = Boolean(
      cloudConfig?.enabled &&
        cloudConfig.configured &&
        window.confirm(
          'Có xóa cả dữ liệu tháng này trên Supabase không?\n\nOK = xóa Supabase, local và Drive.\nCancel = chỉ xóa local và Drive, Supabase vẫn giữ.',
        ),
    )

    setHistoryLoading(true)
    setError(null)
    setMessage(null)
    try {
      await axios.delete(`${API_BASE}/history/months/${year}/${month}`, {
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

  async function exportOutput1() {
    if (!data) return
    if (
      pendingReviewCount > 0 &&
      !window.confirm(`Còn ${pendingReviewCount} mục đi trễ/quên bấm/chưa rõ chưa được xác nhận. Bạn có chắc muốn xuất Output 1 không?`)
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
          ? 'Đã xuất Output 1 và bổ sung 3 cột: Tổng giờ công, Mã, Tên nhân viên / Ghi chú.'
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
      !window.confirm(`Còn ${pendingReviewCount} mục đi trễ/quên bấm/chưa rõ chưa được xác nhận. Bạn có chắc muốn xuất ảnh bảng công nhân viên không?`)
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

  if (authLoading) {
    return (
      <main className="app-shell auth-shell">
        <section className="auth-card">
          <p className="eyebrow">AttendanceSystem</p>
          <h1>Đang kiểm tra đăng nhập...</h1>
        </section>
      </main>
    )
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
    <main className="app-shell">
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
            <a href="tel:0905885029">Hỗ trợ kỹ thuật</a>
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
                onClick={() => exportEmployeeCards('output1')}
              >
                {cardExportLoading === 'output1' ? 'Đang xuất ảnh...' : 'Xuất ảnh bảng công NV'}
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

      {activeView === 'bank' ? (
        <BankPayrollView factory={factoryMode} />
      ) : (
      <>
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
            {!smartScanEnabled && (
              <p className="smart-settings-warning">
                Khi tắt kiểm tra, app vẫn xử lý file nhưng sẽ không cảnh báo trước nếu chọn nhầm loại bảng hoặc nhầm kỳ.
              </p>
            )}
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
                Nếu tiếp tục, kết quả phân tích tạm và các phần vừa chỉnh sẽ bị xóa để tránh lẫn dữ liệu giữa hai xưởng.
              </p>
              <div className="factory-switch-dialog-note">
                Phiên này chưa được lưu vào lịch sử hoặc Drive nên sẽ không thể khôi phục sau khi xóa.
              </div>
            </div>
            <div className="factory-switch-dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setPendingFactorySwitch(null)}>
                Ở lại {factoryMode === 'factory1' ? 'Xưởng 1' : 'Xưởng 2'}
              </button>
              <button type="button" className="danger-button" onClick={confirmFactorySwitch}>
                Xóa phiên tạm và chuyển
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
              lương, thưởng, ứng lương và ghi chú đang lưu trên máy.
            </p>
            <div className="export-choice-options">
              <button type="button" className="export-choice-card" onClick={() => void runOutput2Export(true)}>
                <strong>Có dữ liệu đã lưu</strong>
                <span>Điền sẵn thông tin lương, thưởng, ứng lương và ghi chú.</span>
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

      <section className="upload-panel">
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
        <button type="button" disabled={!file || loading} onClick={analyze}>
          {loading ? 'Đang phân tích...' : 'Phân tích tạm'}
        </button>
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
                busy={finalCopyInspecting ? 'Đang kiểm tra file chốt...' : null}
                disabled={cloudLoading}
                onFile={selectFinalCopyFile}
              />
              <button type="button" disabled={!finalCopyFile || !finalCopyMonth || !finalCopyYear || finalCopyInspecting || cloudLoading} onClick={saveFinalCopy}>
                {cloudLoading ? 'Đang lưu...' : 'Lưu bản sao cuối cùng'}
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
          latestHistoryInfo={latestHistoryInfo}
          knownHistoryCodes={knownHistoryCodes}
          selectedCode={selectedCode}
          form={form}
          loading={payrollLoading}
          cardExportLoading={cardExportLoading === 'output2'}
          onSelect={selectEmployee}
          onFilterYearChange={changeEmployeeListYear}
          onFilterMonthChange={setEmployeeListMonth}
          onFormChange={setForm}
          onReviewItemsChange={setPayrollReviewItems}
          onSavePatches={savePayrollPatches}
          onSave={savePayroll}
          onExport={exportOutput2}
          onExportCards={() => exportEmployeeCards('output2')}
        />
      )}

      {isOwner && activeView === 'employees' && (
        <EmployeeRegistryView
          employees={employeeRegistry}
          attendanceOverview={attendanceOverview}
          filterYear={employeeListYear}
          filterMonth={employeeListMonth}
          selectedCode={selectedCode}
          form={form}
          loading={payrollLoading}
          onSelect={selectRegistryEmployee}
          onCreate={createRegistryEmployee}
          onFilterYearChange={changeEmployeeListYear}
          onFilterMonthChange={setEmployeeListMonth}
          onFormChange={setForm}
          onSave={savePayroll}
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
          onSelectPeriod={selectHistoryPeriod}
          onSelectFinalCopy={selectHistoryFinalCopy}
          onDeleteMonth={deleteHistoryMonth}
          onSelectSearchResult={selectHistorySearchResult}
          onSaveEmployee={saveHistoryEmployee}
          onDownloadOutput={downloadHistoryOutput}
          onDownloadFinalCopy={downloadFinalCopyOutput}
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
  conflict_accounts?: string[]
}

type BankScan = {
  scan_id: string
  month: number | null
  year: number | null
  source_filename: string
  employees: BankEmployee[]
}

function BankPayrollView({ factory }: { factory: FactoryMode }) {
  const [file, setFile] = useState<File | null>(null)
  const [scan, setScan] = useState<BankScan | null>(null)
  const [rows, setRows] = useState<BankEmployee[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [exportChoiceOpen, setExportChoiceOpen] = useState(false)
  const [wordFile, setWordFile] = useState<File | null>(null)
  const [wordMonth, setWordMonth] = useState(String(new Date().getMonth() + 1))
  const [wordYear, setWordYear] = useState(String(new Date().getFullYear()))
  const missing = rows.filter((row) => !row.account_number.trim()).length
  const conflictCount = rows.filter((row) => row.conflict_accounts?.length).length
  const total = rows.reduce((sum, row) => sum + Number(row.salary || 0), 0)
  const visibleRows = rows.filter((row) => {
    const keyword = search.trim().toLowerCase()
    return !keyword || row.employee_code.toLowerCase().includes(keyword) || row.name.toLowerCase().includes(keyword)
  })

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
      setScan(response.data)
      setRows(response.data.employees)
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
        `${API_BASE}/bank/${kind}-drive${kind === 'restore' ? `?factory=${factory}` : ''}`,
      )
      if (kind === 'restore' && file) {
        const form = new FormData()
        form.append('factory', factory)
        form.append('file', file)
        const refreshed = await axios.post<BankScan>(`${API_BASE}/bank/scan`, form)
        setScan(refreshed.data)
        setRows(refreshed.data.employees)
      }
      setNotice(
        kind === 'backup'
          ? 'Đã sao lưu danh sách tài khoản lên Drive.'
          : response.data.source === 'latest_word'
            ? `Đã lấy bảng Word mới nhất trên Drive${response.data.month && response.data.year ? ` (${response.data.month}/${response.data.year})` : ''}.`
            : 'Đã khôi phục danh sách tài khoản từ Drive.',
      )
    } catch (err) {
      setError(readAxiosError(err, 'Không đồng bộ được với Drive'))
    } finally {
      setBusy('')
    }
  }

  async function selectWordFile(selected: File | null) {
    setWordFile(selected)
    if (!selected) return
    setError('')
    const form = new FormData()
    form.append('file', selected)
    try {
      const response = await axios.post<{ month: number | null; year: number | null }>(`${API_BASE}/bank/inspect-word`, form)
      if (response.data.month) setWordMonth(String(response.data.month))
      if (response.data.year) setWordYear(String(response.data.year))
    } catch (err) {
      setError(readAxiosError(err, 'Không đọc được tháng/năm trong file Word'))
    }
  }

  async function importWord() {
    if (!wordFile || !wordMonth || !wordYear) return
    setBusy('word')
    setError('')
    setNotice('')
    const form = new FormData()
    form.append('factory', factory)
    form.append('month', wordMonth)
    form.append('year', wordYear)
    form.append('file', wordFile)
    try {
      const response = await axios.post<{ imported: number; conflicts: { employee_code: string; accounts: string[] }[]; drive_path: string | null }>(
        `${API_BASE}/bank/import-word`,
        form,
      )
      const imported = response.data as typeof response.data & { month?: number; year?: number }
      if (imported.month) setWordMonth(String(imported.month))
      if (imported.year) setWordYear(String(imported.year))
      if (scan) {
        const refreshed = await axios.post<BankScan>(`${API_BASE}/bank/scan`, (() => {
          const next = new FormData()
          next.append('factory', factory)
          if (file) next.append('file', file)
          return next
        })())
        setScan(refreshed.data)
        setRows(refreshed.data.employees)
      }
      setNotice(
        `Đã nhập ${response.data.imported} tài khoản từ Word${response.data.drive_path ? ' và sao lưu theo tháng/năm trên Drive' : ''}.`
        + (response.data.conflicts.length ? ` Có ${response.data.conflicts.length} mã cần kiểm tra vì có hai số tài khoản.` : ''),
      )
    } catch (err) {
      setError(readAxiosError(err, 'Không nhập được danh sách tài khoản từ Word'))
    } finally {
      setBusy('')
    }
  }

  async function exportWord(saveToDrive: boolean) {
    if (!scan) return
    setExportChoiceOpen(false)
    setBusy('export')
    setError('')
    try {
      if (saveToDrive) {
        await axios.post(`${API_BASE}/bank/accounts`, { factory, accounts: rows })
        await axios.post(`${API_BASE}/bank/backup-drive`)
      }
      const response = await axios.post(
        `${API_BASE}/bank/export`,
        { scan_id: scan.scan_id, accounts: rows },
        { responseType: 'blob' },
      )
      const month = String(scan.month || 0).padStart(2, '0')
      downloadBlob(response.data, `Xuong${factory === 'factory2' ? 2 : 1}_${scan.year || 'KhongRo'}-${month}_BangLuongNganHang.docx`)
      setNotice(saveToDrive ? 'Đã lưu danh sách lên Drive và xuất bảng lương Word.' : 'Đã xuất Word; danh sách này không được lưu lên Drive.')
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
            <p className="export-choice-kicker">Xuất Word ngân hàng</p>
            <h2 id="bank-export-choice-title">Bạn có muốn lưu danh sách này không?</h2>
            <p>
              Nếu lưu, số tài khoản sẽ được ghi nhớ trên máy và sao lưu vào Drive để dùng lại ở tháng sau.
              Nếu không lưu, app chỉ tạo file Word lần này.
            </p>
            <div className="export-choice-options">
              <button type="button" className="export-choice-card bank-save-choice" onClick={() => void exportWord(true)}>
                <strong>Lưu Drive và xuất</strong>
                <span>Ghi nhớ số tài khoản, sao lưu lên Drive rồi tạo file Word.</span>
              </button>
              <button type="button" className="export-choice-card formula-only" onClick={() => void exportWord(false)}>
                <strong>Không lưu, chỉ xuất</strong>
                <span>Không thay đổi dữ liệu đã lưu; chỉ tạo file Word hiện tại.</span>
              </button>
            </div>
            <button type="button" className="secondary-button export-choice-cancel" onClick={() => setExportChoiceOpen(false)}>Hủy</button>
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
          <p>Quét Output 2 chính thức, tự điền tài khoản đã lưu và xuất file Word sẵn sàng gửi ngân hàng.</p>
        </div>
        <span className="bank-factory-pill">Xưởng {factory === 'factory2' ? 2 : 1}</span>
      </div>

      <div className="bank-command-card">
        <label className="bank-file-picker">
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
          <strong>Nhập danh sách Word cũ</strong>
          <span>Lưu theo tháng/năm trên Drive và tự điền lại số tài khoản đã có.</span>
        </div>
        <label className="bank-word-picker">
          <input type="file" accept=".docx" onChange={(event) => void selectWordFile(event.target.files?.[0] || null)} />
          <span>WORD</span>
          <strong>{wordFile?.name || 'Chọn file .docx'}</strong>
        </label>
        <label className="bank-period-field"><span>Tháng</span><input className="bank-period-input" type="number" min="1" max="12" value={wordMonth} onChange={(event) => setWordMonth(event.target.value)} aria-label="Tháng danh sách Word" /></label>
        <label className="bank-period-field year"><span>Năm</span><input className="bank-period-input year" type="number" min="2000" value={wordYear} onChange={(event) => setWordYear(event.target.value)} aria-label="Năm danh sách Word" /></label>
        <button type="button" className="secondary-button" disabled={!wordFile || !wordMonth || !wordYear || Boolean(busy)} onClick={importWord}>
          {busy === 'word' ? 'Đang nhập...' : 'Nhập Word'}
        </button>
      </div>

      {error && <AppToast kind="error" message={error} onClose={() => setError('')} />}
      {notice && <AppToast kind="success" message={notice} onClose={() => setNotice('')} />}

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
                  <tr key={row.employee_code} className={row.conflict_accounts?.length ? 'bank-conflict-row' : ''}>
                    <td>{index + 1}</td><td><strong>{row.employee_code}</strong></td><td>{row.name}</td>
                    <td>
                      <input inputMode="numeric" value={row.account_number} placeholder="Nhập số tài khoản" onChange={(event) => setRows((current) => current.map((item) => item.employee_code === row.employee_code ? { ...item, account_number: event.target.value.replace(/\D/g, ''), conflict_accounts: [] } : item))} />
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
                    </td>
                    <td className="bank-money">{Number(row.salary).toLocaleString('vi-VN')} đ</td>
                    <td><span className={`bank-row-status${row.conflict_accounts?.length ? ' conflict' : row.account_number ? ' complete' : ''}`}>{row.conflict_accounts?.length ? 'Trùng tài khoản' : row.account_number ? 'Đã đủ' : 'Cần bổ sung'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="bank-table-footer">
          <span>{conflictCount ? `Có ${conflictCount} mã đang có hai số tài khoản; hãy nhập lại số đúng trước khi xuất.` : missing ? `Còn ${missing} nhân viên cần nhập số tài khoản trước khi xuất.` : rows.length ? 'Danh sách đã đủ thông tin để xuất.' : 'Dữ liệu được lưu trên máy; Drive dùng để sao lưu và khôi phục.'}</span>
          <div>
            <button type="button" className="secondary-button" disabled={!rows.length || Boolean(busy) || conflictCount > 0} onClick={save}>{busy === 'save' ? 'Đang lưu...' : 'Lưu số tài khoản'}</button>
            <button type="button" disabled={!scan || Boolean(busy) || missing > 0 || conflictCount > 0} onClick={() => setExportChoiceOpen(true)}>{busy === 'export' ? 'Đang tạo Word...' : 'Xuất Word ngân hàng'}</button>
          </div>
        </div>
      </div>
    </section>
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

      <div className="panel cloud-panel">
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
}: {
  data: AnalyzeResponse
  reviewItems: PayrollReviewItem[]
  onReviewItemsChange: (items: PayrollReviewItem[]) => void
}) {
  const [selectedCode, setSelectedCode] = useState(data.blocks[0]?.employee_code ?? '')
  const selectedBlock = data.blocks.find((block) => block.employee_code === selectedCode) ?? data.blocks[0]

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

      <section className="attendance-output-layout">
        <nav className="payroll-tools">
          <a href="#output1-employees">Mã NV</a>
          <a href="#output1-detail">Chi tiết</a>
          <a href="#output1-review">Kiểm tra</a>
          <a href="#manual-checks">Thủ công</a>
        </nav>

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

        <EmployeeWorkPanel
          id="output1-detail"
          title="Chi tiết công"
          employeeCode={selectedBlock?.employee_code ?? ''}
          rows={selectedBlock ? blockToWorkRows(selectedBlock, data.manual_checks) : []}
          totalHours={selectedBlock ? totalBlockHours(selectedBlock) : 0}
          workDays={selectedBlock ? totalBlockHours(selectedBlock) / 8 : 0}
        />

        <PayrollReviewPanel
          id="output1-review"
          title="Kiểm tra Output"
          items={reviewItems}
          onChange={onReviewItemsChange}
        />

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
      </section>
    </>
  )
}

function EmployeeRegistryView({
  employees,
  attendanceOverview,
  filterYear,
  filterMonth,
  selectedCode,
  form,
  loading,
  onSelect,
  onCreate,
  onFilterYearChange,
  onFilterMonthChange,
  onFormChange,
  onSave,
}: {
  employees: PayrollEmployee[]
  attendanceOverview: AttendanceOverview | null
  filterYear: string
  filterMonth: string
  selectedCode: string
  form: PayrollForm
  loading: boolean
  onSelect: (code: string) => void
  onCreate: () => void
  onFilterYearChange: (year: string) => void
  onFilterMonthChange: (month: string) => void
  onFormChange: (form: PayrollForm) => void
  onSave: () => void
}) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const monthEmployees = filterEmployeesByMonth(employees, attendanceOverview, filterYear, filterMonth)
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
          <span>{filteredEmployees.length} mã</span>
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
          <h2>Thông tin nhân viên dùng chung</h2>
          <span>{form.employee_code || 'Mã mới'}</span>
        </div>
        <div className="form-grid">
          <Input label="Mã nhân viên" value={form.employee_code} onChange={(value) => onFormChange({ ...form, employee_code: value })} />
          <Input label="Tên nhân viên" value={form.name} onChange={(value) => onFormChange({ ...form, name: value })} />
          <Input label="Bắt đầu làm" value={form.start_work_note} onChange={(value) => onFormChange({ ...form, start_work_note: value })} />
          <Input label="Mức lương" value={calculatedMonthlySalaryValue(form)} onChange={() => undefined} type="number" readOnly />
          <Input label="Lương 1 ngày công" value={calculatedDailySalaryValue(form)} onChange={() => undefined} type="number" readOnly />
          <Input label="Lương 1 giờ công" value={form.hourly_salary} onChange={(value) => onFormChange({ ...form, hourly_salary: value })} type="number" />
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

function PayrollView({
  employees,
  attendanceData,
  attendanceOverview,
  filterYear,
  filterMonth,
  reviewItems,
  latestHistoryInfo,
  knownHistoryCodes,
  selectedCode,
  form,
  loading,
  cardExportLoading,
  onSelect,
  onFilterYearChange,
  onFilterMonthChange,
  onFormChange,
  onReviewItemsChange,
  onSavePatches,
  onSave,
  onExport,
  onExportCards,
}: {
  employees: PayrollEmployee[]
  attendanceData: AnalyzeResponse
  attendanceOverview: AttendanceOverview | null
  filterYear: string
  filterMonth: string
  reviewItems: PayrollReviewItem[]
  latestHistoryInfo: LatestHistoryInfo
  knownHistoryCodes: string[]
  selectedCode: string
  form: PayrollForm
  loading: boolean
  cardExportLoading: boolean
  onSelect: (code: string) => void
  onFilterYearChange: (year: string) => void
  onFilterMonthChange: (month: string) => void
  onFormChange: (form: PayrollForm) => void
  onReviewItemsChange: (items: PayrollReviewItem[]) => void
  onSavePatches: (updates: PayrollPatchUpdate[]) => Promise<void>
  onSave: () => void
  onExport: () => void
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
    employees.filter(
      (employee) =>
        isNewestPeriod && !latestCodeSet.has(employee.employee_code),
    ),
  ).map((employee): NewEmployeeItem => ({
    ...employee,
    novelty: knownCodeSet.has(employee.employee_code) ? 'returning' : 'first-time',
  }))

  return (
    <section className="payroll-layout">
      <nav className="payroll-tools">
        <a href="#payroll-info">Lương</a>
        <a href="#new-employees">Mới</a>
        <a href="#payroll-review">Kiểm tra</a>
        <a href="#bonus-entry">Thưởng</a>
        <a href="#penalty-entry">Phạt</a>
        <a href="#note-entry">Ghi chú</a>
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
        <div className="form-grid">
          <Input label="Tên nhân viên" value={form.name} onChange={(value) => onFormChange({ ...form, name: value })} />
          <Input label="Bắt đầu làm" value={form.start_work_note} onChange={(value) => onFormChange({ ...form, start_work_note: value })} />
          <Input label="Mức lương" value={calculatedMonthlySalaryValue(form)} onChange={() => undefined} type="number" readOnly />
          <Input label="Lương 1 ngày công" value={calculatedDailySalaryValue(form)} onChange={() => undefined} type="number" readOnly />
          <Input label="Lương 1 giờ công" value={form.hourly_salary} onChange={(value) => onFormChange({ ...form, hourly_salary: value })} type="number" />
          <Input label="Thưởng" value={form.bonus} onChange={(value) => onFormChange({ ...form, bonus: value })} type="number" />
          <Input label="Ứng lương + phạt" value={form.advance_or_penalty} onChange={(value) => onFormChange({ ...form, advance_or_penalty: value })} type="number" />
          <label className="field field-wide">
            <span>Ghi chú dòng h+7</span>
            <textarea value={form.note} onChange={(event) => onFormChange({ ...form, note: event.target.value })} />
          </label>
        </div>
        <div className="payroll-actions">
          <button type="button" disabled={!selectedCode || loading} onClick={onSave}>Lưu thông tin lương</button>
          <button type="button" disabled={loading} onClick={onExport}>Xuất Output 2</button>
          <button type="button" disabled={loading || cardExportLoading} onClick={onExportCards}>
            {attendanceData.factory === 'factory2'
              ? 'Ảnh NV chưa có mẫu'
              : cardExportLoading
                ? 'Đang xuất ảnh...'
                : 'Xuất ảnh bảng công NV'}
          </button>
        </div>
      </div>

      <NewEmployeesPanel
        employees={newEmployees}
        latestPeriodLabel={latestHistoryInfo.period?.label ?? ''}
        selectedCode={selectedCode}
        onSelect={onSelect}
      />

      <PayrollReviewPanel items={reviewItems} onChange={onReviewItemsChange} />

      <BulkPayrollSection
        id="bonus-entry"
        title="Nhập thưởng"
        field="bonus"
        employees={sortedEmployees}
        loading={loading}
        onApply={onSavePatches}
      />
      <BulkPayrollSection
        id="penalty-entry"
        title="Nhập ứng lương + phạt"
        field="advance_or_penalty"
        employees={sortedEmployees}
        loading={loading}
        onApply={onSavePatches}
      />
      <BulkPayrollSection
        id="note-entry"
        title="Nhập ghi chú"
        field="note"
        employees={sortedEmployees}
        loading={loading}
        onApply={onSavePatches}
      />
    </section>
  )
}

function reviewPairKey(item: Pick<PayrollReviewItem, 'employee_code' | 'day'>) {
  return `${item.employee_code}:${item.day}`
}

function PayrollReviewPanel({
  id = 'payroll-review',
  title = 'Kiểm tra Output',
  items,
  onChange,
}: {
  id?: string
  title?: string
  items: PayrollReviewItem[]
  onChange: (items: PayrollReviewItem[]) => void
}) {
  const [viewMode, setViewMode] = useState<'pending' | 'history' | 'all'>('pending')
  const pendingCount = items.filter((item) => item.status === 'pending').length
  const historyAppliedCount = items.filter((item) => item.origin === 'history-applied').length
  const ruleChangedCount = items.filter((item) => item.type === 'rule_change').length
  const newcomerReviewCount = items.filter((item) => item.novelty).length
  const visibleItems =
    viewMode === 'pending'
      ? items.filter((item) => item.status === 'pending')
      : viewMode === 'history'
        ? items.filter((item) => item.origin === 'history-applied')
        : items
  const missingItems = visibleItems.filter((item) => item.type === 'missing')
  const lateItems = visibleItems.filter((item) => item.type === 'late')
  const ruleChangeItems = visibleItems.filter((item) => item.type === 'rule_change')
  const pairedReviewKeys = new Set(
    items
      .filter((item) => item.type === 'missing' || item.type === 'late')
      .map((item) => reviewPairKey(item))
      .filter((key, index, keys) => keys.indexOf(key) !== index),
  )
  const pairedLocks = items.reduce<Record<string, PayrollReviewType>>((locks, item) => {
    const key = reviewPairKey(item)
    if (pairedReviewKeys.has(key) && item.pair_selected) locks[key] = item.type
    return locks
  }, {})

  function confirmItem(id: string) {
    const selectedItem = items.find((candidate) => candidate.id === id)
    const selectedKey = selectedItem ? reviewPairKey(selectedItem) : ''
    const dismissPairedReview = Boolean(selectedItem && pairedReviewKeys.has(selectedKey))
    onChange(
      items.map((item) => {
        const isSelected = item.id === id
        const isPairedReview = dismissPairedReview && reviewPairKey(item) === selectedKey
        if (!isSelected && !isPairedReview) return item
        return {
          ...item,
          status: isSelected && hasReviewDraftChanges(item) ? 'edited' : 'ok',
          pair_selected: isSelected,
        }
      }),
    )
  }

  function editItem(id: string) {
    const selectedItem = items.find((candidate) => candidate.id === id)
    const selectedKey = selectedItem ? reviewPairKey(selectedItem) : ''
    const switchPairedReview = Boolean(selectedItem && pairedReviewKeys.has(selectedKey))
    onChange(
      items.map((item) => {
        const isSelected = item.id === id
        const isPairedReview = switchPairedReview && reviewPairKey(item) === selectedKey
        if (!isSelected && !isPairedReview) return item
        return { ...item, status: 'pending', pair_selected: isSelected }
      }),
    )
  }

  function updateItem(id: string, patch: Partial<Pick<PayrollReviewItem, 'value' | 'work_value'>>) {
    const selectedItem = items.find((candidate) => candidate.id === id)
    const selectedKey = selectedItem ? reviewPairKey(selectedItem) : ''
    const switchPairedReview = Boolean(selectedItem && pairedReviewKeys.has(selectedKey))
    onChange(
      items.map((item) => {
        const isSelected = item.id === id
        const isPairedReview = switchPairedReview && reviewPairKey(item) === selectedKey
        if (!isSelected && !isPairedReview) return item
        return {
          ...item,
          ...(isSelected ? patch : {}),
          pair_selected: isSelected,
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
          Tất cả {items.length}
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
      <div className="review-grid">
        <ReviewTable
          title="Quên bấm / chưa rõ"
          valueLabel="Ghi chú"
          items={missingItems}
          pairedReviewKeys={pairedReviewKeys}
          pairedLocks={pairedLocks}
          onConfirm={confirmItem}
          onEdit={editItem}
          onUpdate={updateItem}
        />
        <ReviewTable
          title="Đi trễ"
          valueLabel="Phút trễ"
          items={lateItems}
          pairedReviewKeys={pairedReviewKeys}
          pairedLocks={pairedLocks}
          onConfirm={confirmItem}
          onEdit={editItem}
          onUpdate={updateItem}
        />
        <ReviewTable
          title="Đổi công do rule"
          valueLabel="Công cũ"
          items={ruleChangeItems}
          pairedReviewKeys={pairedReviewKeys}
          pairedLocks={pairedLocks}
          onConfirm={confirmItem}
          onEdit={editItem}
          onUpdate={updateItem}
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
  onApply,
}: {
  id: string
  title: string
  field: BulkPayrollField
  employees: PayrollEmployee[]
  loading: boolean
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
  pairedLocks,
  onConfirm,
  onEdit,
  onUpdate,
}: {
  title: string
  valueLabel: string
  items: PayrollReviewItem[]
  pairedReviewKeys: Set<string>
  pairedLocks: Record<string, PayrollReviewType>
  onConfirm: (id: string) => void
  onEdit: (id: string) => void
  onUpdate: (id: string, patch: Partial<Pick<PayrollReviewItem, 'value' | 'work_value'>>) => void
}) {
  return (
    <div className="review-table">
      <div className="review-title">
        <strong>{title}</strong>
        <span>{items.length} dòng</span>
      </div>
      <div className="table-wrap">
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
              const lockedByOtherSide = pairedReviewKeys.has(pairKey) && Boolean(pairedLocks[pairKey]) && pairedLocks[pairKey] !== item.type
              return (
              <tr
                key={item.id}
                className={[
                  item.status === 'pending' ? 'warning-row' : 'selected-row',
                  item.novelty ? 'review-newcomer-row' : '',
                  lockedByOtherSide ? 'review-peer-locked' : '',
                ].join(' ')}
              >
                <td>{item.employee_code}</td>
                <td>{item.day}</td>
                <td>{item.punches.join(', ')}</td>
                <td>
                  <input
                    className="table-input"
                    value={item.value}
                    placeholder="Xóa"
                    disabled={lockedByOtherSide}
                    onChange={(event) => onUpdate(item.id, { value: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="table-input"
                    value={item.work_value}
                    placeholder="Xóa"
                    disabled={lockedByOtherSide}
                    onChange={(event) => onUpdate(item.id, { work_value: event.target.value })}
                  />
                </td>
                <td>{lockedByOtherSide ? <span className="review-peer-lock-label">Đã chọn bên kia</span> : reviewStatusLabel(item.status)}</td>
                <td>
                  <div className="table-actions">
                    <button type="button" disabled={lockedByOtherSide} onClick={() => onConfirm(item.id)}>OK</button>
                    <button type="button" onClick={() => onEdit(item.id)}>Sửa</button>
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
      </div>
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
  onSelectPeriod,
  onSelectFinalCopy,
  onDeleteMonth,
  onSelectSearchResult,
  onSaveEmployee,
  onDownloadOutput,
  onDownloadFinalCopy,
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
  onSelectPeriod: (periodId: string) => void
  onSelectFinalCopy: (copyId: string) => void
  onDeleteMonth: (month: number, year: number) => void
  onSelectSearchResult: (result: HistorySearchResult) => void
  onSaveEmployee: (periodId: string, employeeCode: string, draft: HistoryEmployeeDraft) => Promise<void>
  onDownloadOutput: (periodId: string, kind: 'output1' | 'output2') => Promise<void>
  onDownloadFinalCopy: (copyId: string, kind: 'output1' | 'output2') => Promise<void>
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

  function confirmDiscardChanges() {
    if (!hasAnyChanges && !reviewDirty) return true
    return window.confirm('Bạn có thay đổi chưa lưu. Bỏ thay đổi và chuyển sang mục khác?')
  }

  function selectPeriodWithGuard(periodId: string) {
    if (confirmDiscardChanges()) {
      onSelectPeriod(periodId)
      setDetailMode(false)
      setReviewMode(false)
      setReviewDirty(false)
    }
  }

  async function openDetail(result: HistorySearchResult) {
    if (confirmDiscardChanges()) {
      await onSelectSearchResult(result)
      setDetailMode(true)
      setReviewMode(false)
      setReviewDirty(false)
    }
  }

  function updateDraft(field: HistoryEditableField, value: string) {
    setDraft((current) => (current ? { ...current, [field]: value } : current))
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
        onBack={() => {
          if (confirmDiscardChanges()) setDetailMode(false)
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
        onBack={() => {
          if (confirmDiscardChanges()) {
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
                <button
                  type="button"
                  className="period-delete"
                  disabled={loading}
                  onClick={() => onDeleteMonth(item.month, item.year)}
                >
                  Xóa
                </button>
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
  onSelectPeriod: (periodId: string) => void
  onSelectFinalCopy: (copyId: string) => void
  onOpenReview: () => void
}) {
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
        <button type="button" disabled={loading || !detail || Boolean(finalCopy)} onClick={onOpenReview}>
          Rà soát xác nhận
        </button>
      </div>
    </div>
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
            Uu tien ban chot Drive: {overview.source.final_copy_months.length ? overview.source.final_copy_months.map((month) => `T${month}`).join(', ') : 'chua co'}.
            {' '}Ban may cham: {overview.source.machine_months.length ? overview.source.machine_months.map((month) => `T${month}`).join(', ') : 'khong co'}.
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
  onFile,
}: {
  id: string
  file: File | null
  displayName?: string
  placeholder: string
  busy?: string | null
  disabled?: boolean
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
        accept=".xlsx,.xlsm"
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
  const dailySalary = calculatedDailySalary(form)
  return dailySalary === null ? '' : String(roundDraftNumber(dailySalary * 26))
}

function calculatedDailySalaryValue(form: PayrollForm) {
  const dailySalary = calculatedDailySalary(form)
  return dailySalary === null ? '' : String(roundDraftNumber(dailySalary))
}

function calculatedDailySalary(form: PayrollForm) {
  const hourlySalary = parseOptionalNumber(form.hourly_salary)
  return hourlySalary === null ? null : hourlySalary * 8
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
    bonus: '0',
    advance_or_penalty: '0',
    note: '',
  }
}

function formFromEmployee(employee: PayrollEmployee): PayrollForm {
  const hourlySalary =
    Number(employee.hourly_salary || 0) > 0
      ? employee.hourly_salary
      : Number(employee.daily_salary_input || employee.daily_salary || 0) > 0
        ? Number(employee.daily_salary_input || employee.daily_salary) / 8
        : 0
  const form = {
    employee_code: employee.employee_code,
    name: employee.name ?? '',
    start_work_note: employee.start_work_note ?? '',
    monthly_salary: '',
    daily_salary: '',
    hourly_salary: hourlySalary ? String(roundDraftNumber(hourlySalary)) : '',
    standard_work_days: '26',
    bonus: String(employee.bonus || 0),
    advance_or_penalty: String(employee.advance_or_penalty || 0),
    note: employee.note ?? '',
  }
  return {
    ...form,
    monthly_salary: calculatedMonthlySalaryValue(form) || (employee.monthly_salary ? String(employee.monthly_salary) : ''),
    daily_salary: calculatedDailySalaryValue(form) || (employee.daily_salary ? String(employee.daily_salary) : ''),
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

function payrollPayload(form: PayrollForm) {
  return {
    employee_code: form.employee_code,
    name: form.name,
    start_work_note: form.start_work_note,
    monthly_salary: parseOptionalNumber(calculatedMonthlySalaryValue(form)),
    daily_salary: parseOptionalNumber(calculatedDailySalaryValue(form)),
    hourly_salary: parseOptionalNumber(form.hourly_salary),
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

  return data.blocks.flatMap((block) =>
    block.results.flatMap((result) => {
      const messages = manualByEmployeeDay[`${block.employee_code}-${result.day}`] ?? []
      const history = memoryByEmployeeDay[reviewKey(block.employee_code, result.day)]
      const historyMatchesPunches = history ? samePunches(history.punches, result.punches) : false
      const base = {
        employee_code: block.employee_code,
        novelty: employeeNoveltyForPeriod(block.employee_code, data.period, latestHistoryInfo, knownHistoryCodes),
        day: result.day,
        punches: result.punches,
        messages,
        original_work_value: result.work_value,
        work_value: result.work_value === null ? '' : String(result.work_value),
        status: 'pending' as PayrollReviewStatus,
      }
      const items: PayrollReviewItem[] = []
      if (result.missing_count !== null) {
        items.push({
          ...base,
          id: `missing-${block.employee_code}-${result.day}`,
          type: 'missing',
          original_value: result.missing_count,
          value: String(result.missing_count),
        })
      }
      if (result.missing_count === null && messages.includes('Không đủ cặp giờ để tính công')) {
        items.push({
          ...base,
          id: `missing-incomplete-pair-${block.employee_code}-${result.day}`,
          type: 'missing',
          original_value: '?',
          value: '?',
        })
      }
      if (result.late_minutes !== null) {
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
): PayrollReviewItem[] {
  const derivedItems = buildPayrollReviewItems(data, latestHistoryInfo, knownHistoryCodes, reviewMemory)
  const savedById = new Map(savedItems.map((item) => [item.id, item]))

  return derivedItems.map((derivedItem) => {
    const savedItem = savedById.get(derivedItem.id)
    if (!savedItem) return derivedItem
    return {
      ...derivedItem,
      value: savedItem.value,
      work_value: savedItem.work_value,
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
  if (!history || !historyMatchesPunches || item.type === 'rule_change' || !history.review_notes.length) {
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

function parseNumber(value: string, fallback: number) {
  if (!value.trim()) return fallback
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function cleanParams(params: Record<string, string>) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value.trim() !== ''))
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
  return [
    `Đã gán dữ liệu: ${summary.matched_count} mã khớp.`,
    `Tháng mới có ${summary.new_count} mã mới${newCodes ? ` (${newCodes})` : ''}.`,
    `File cũ có ${summary.inactive_count} mã không còn trong tháng mới${inactiveCodes ? ` (${inactiveCodes})` : ''}.`,
    summary.deduction_review_count
      ? `${summary.deduction_review_count} mã có ứng/phạt tháng cũ đã được để trống và đánh dấu ?${reviewCodes ? ` (${reviewCodes})` : ''}.`
      : 'Không có khoản ứng/phạt cũ cần đánh dấu.',
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
  link.click()
  URL.revokeObjectURL(url)
}

function downloadFromUrl(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
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
    }
    return {
      smartScan: saved.smartScan ?? true,
      smartMapping: saved.smartMapping ?? true,
    }
  } catch {
    return { smartScan: true, smartMapping: true }
  }
}

function isExcelFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return lowerName.endsWith('.xlsx') || lowerName.endsWith('.xlsm')
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
