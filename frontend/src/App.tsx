import { useEffect, useState } from 'react'
import axios from 'axios'
import './App.css'

const API_BASE = 'http://127.0.0.1:8000/api'

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

type AnalyzeResponse = {
  session_id: string
  filename: string
  sheet_name: string
  period: PeriodInfo
  summary: Summary
  blocks: EmployeeBlock[]
  manual_checks: ManualCheck[]
}

type PeriodInfo = {
  month: number | null
  year: number | null
  label: string
}

type PayrollEmployee = {
  employee_code: string
  name: string
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
  monthly_salary: string
  daily_salary: string
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

type HistoryPeriod = {
  id: string
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

type HistoryEmployee = {
  employee_code: string
  employee_name: string
  total_hours: number
  work_days: number
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

type LatestHistoryInfo = {
  period: HistoryPeriod | null
  employee_codes: string[]
}

type WorkDayRow = {
  day: number
  punches: string[]
  work_value: number | string | null
  missing_count: number | string | null
  late_minutes: number | null
  manual_checks: string[]
}

type PayrollReviewType = 'missing' | 'late'
type PayrollReviewStatus = 'pending' | 'ok' | 'edited'

type PayrollReviewItem = {
  id: string
  type: PayrollReviewType
  employee_code: string
  day: number
  punches: string[]
  original_value: number | string
  value: string
  original_work_value: number | string | null
  work_value: string
  status: PayrollReviewStatus
  messages: string[]
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [data, setData] = useState<AnalyzeResponse | null>(null)
  const [payrollEmployees, setPayrollEmployees] = useState<PayrollEmployee[]>([])
  const [payrollReviewItems, setPayrollReviewItems] = useState<PayrollReviewItem[]>([])
  const [latestHistoryInfo, setLatestHistoryInfo] = useState<LatestHistoryInfo>({ period: null, employee_codes: [] })
  const [selectedCode, setSelectedCode] = useState<string>('')
  const [form, setForm] = useState<PayrollForm>(emptyPayrollForm())
  const [activeView, setActiveView] = useState<'attendance' | 'payroll' | 'history'>('attendance')
  const [periodMonth, setPeriodMonth] = useState('')
  const [periodYear, setPeriodYear] = useState('')
  const [historyPeriods, setHistoryPeriods] = useState<HistoryPeriod[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [historySelectedCode, setHistorySelectedCode] = useState('')
  const [historyDetail, setHistoryDetail] = useState<HistoryDetail | null>(null)
  const [historySearchResults, setHistorySearchResults] = useState<HistorySearchResult[]>([])
  const [historyFilters, setHistoryFilters] = useState({ employee_code: '', month: '', year: '' })
  const [loading, setLoading] = useState(false)
  const [output1Loading, setOutput1Loading] = useState(false)
  const [payrollLoading, setPayrollLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const pendingReviewCount = payrollReviewItems.filter((item) => item.status === 'pending').length
  const currentReviewTableName = 'bảng kiểm tra Output'

  useEffect(() => {
    void loadHistoryPeriods()
  }, [])

  useEffect(() => {
    setPayrollReviewItems(data ? buildPayrollReviewItems(data) : [])
  }, [data])

  async function analyze() {
    if (!file) return

    setLoading(true)
    setError(null)
    setMessage(null)
    const uploadForm = new FormData()
    uploadForm.append('file', file)

    try {
      const latestInfo = await fetchLatestHistoryInfo()
      const response = await axios.post<AnalyzeResponse>(`${API_BASE}/attendance/analyze`, uploadForm)
      setLatestHistoryInfo(latestInfo)
      setData(response.data)
      setPeriodMonth(response.data.period?.month ? String(response.data.period.month) : '')
      setPeriodYear(response.data.period?.year ? String(response.data.period.year) : '')
      setActiveView('attendance')
      await refreshPayroll(response.data.session_id)
    } catch (err) {
      setError(readAxiosError(err, 'Không phân tích được file'))
    } finally {
      setLoading(false)
    }
  }

  async function refreshPayroll(sessionId = data?.session_id) {
    if (!sessionId) return

    const response = await axios.get<{ employees: PayrollEmployee[] }>(`${API_BASE}/payroll/employees`, {
      params: { session_id: sessionId },
    })
    const employees = response.data.employees
    const nextEmployee =
      employees.find((employee) => employee.employee_code === selectedCode) ?? employees[0]
    setPayrollEmployees(employees)
    setSelectedCode(nextEmployee?.employee_code ?? '')
    setForm(nextEmployee ? formFromEmployee(nextEmployee) : emptyPayrollForm())
  }

  async function fetchLatestHistoryInfo() {
    const response = await axios.get<LatestHistoryInfo>(`${API_BASE}/history/latest-period`)
    return response.data
  }

  function selectEmployee(code: string) {
    const employee = payrollEmployees.find((item) => item.employee_code === code)
    setSelectedCode(code)
    setForm(employee ? formFromEmployee(employee) : emptyPayrollForm())
  }

  async function savePayroll() {
    if (!form.employee_code) return

    setPayrollLoading(true)
    setError(null)
    setMessage(null)
    try {
      await axios.post(`${API_BASE}/payroll/save`, payrollPayload(form))
      await refreshPayroll()
      setMessage(`Đã lưu thông tin lương cho mã ${form.employee_code}`)
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

          const payload = payrollPayload({
            employee_code: employee.employee_code,
            name: employee.name ?? '',
            monthly_salary: employee.monthly_salary ? String(employee.monthly_salary) : '',
            daily_salary: employee.daily_salary_input ? String(employee.daily_salary_input) : '',
            standard_work_days: String(employee.standard_work_days || 26),
            bonus: String(employee.bonus || 0),
            advance_or_penalty: String(employee.advance_or_penalty || 0),
            note: employee.note ?? '',
            ...patch,
          })

          return axios.post(`${API_BASE}/payroll/save`, payload)
        }),
      )
      await refreshPayroll()
      setMessage(`Đã áp dụng ${updates.length} thay đổi`)
    } catch (err) {
      setError(readAxiosError(err, 'Không lưu được thông tin lương'))
      throw err
    } finally {
      setPayrollLoading(false)
    }
  }

  async function exportOutput2() {
    if (!data) return
    if (
      pendingReviewCount > 0 &&
      !window.confirm(`Còn ${pendingReviewCount} mục đi trễ/quên bấm/chưa rõ chưa được xác nhận. Bạn có chắc muốn xuất Output 2 không?`)
    ) {
      return
    }

    setPayrollLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await axios.post(
        `${API_BASE}/payroll/export-output-2`,
        {
          session_id: data.session_id,
          review_overrides: buildReviewOverrides(payrollReviewItems),
        },
        {
          responseType: 'blob',
        },
      )
      downloadBlob(response.data, 'payroll_private_output.xlsx')
      setMessage('Đã xuất Output 2')
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
      setHistorySelectedCode(response.data.employees[0]?.employee_code ?? '')
      setActiveView('history')
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
        params: cleanParams(filters),
      })
      setHistoryPeriods(response.data.periods)
    } catch (err) {
      setError(readAxiosError(err, 'Không đọc được lịch sử'))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function selectHistoryPeriod(periodId: string) {
    await loadHistoryDetail(periodId)
  }

  async function loadHistoryDetail(periodId: string, employeeCode?: string) {
    setSelectedPeriodId(periodId)
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
        params: cleanParams(historyFilters),
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

  async function deleteHistoryPeriod(periodId: string) {
    const period = historyPeriods.find((item) => item.id === periodId)
    if (!window.confirm(`Xóa lịch sử ${period?.label ?? 'đã chọn'}? File đã lưu của kỳ này cũng sẽ bị xóa.`)) {
      return
    }

    setHistoryLoading(true)
    setError(null)
    setMessage(null)
    try {
      await axios.delete(`${API_BASE}/history/periods/${periodId}`)
      if (selectedPeriodId === periodId) {
        setSelectedPeriodId('')
        setHistoryDetail(null)
        setHistorySelectedCode('')
        setHistorySearchResults([])
      }
      await loadHistoryPeriods()
      setMessage(`Đã xóa lịch sử ${period?.label ?? ''}`.trim())
    } catch (err) {
      setError(readAxiosError(err, 'Không xóa được lịch sử'))
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
      downloadBlob(response.data, 'attendance_processed.xlsx')
      setMessage('Đã xuất Output 1')
    } catch (err) {
      setError(readAxiosError(err, 'Không xuất được Output 1'))
    } finally {
      setOutput1Loading(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">AttendanceSystem</p>
          <h1>Chấm công từ Excel</h1>
        </div>
        {data && (
          <button type="button" className="download-button" disabled={output1Loading} onClick={exportOutput1}>
            {output1Loading ? 'Đang xuất Output 1...' : 'Tải Output 1'}
          </button>
        )}
      </section>

      <section className="upload-panel">
        <div className="upload-copy">
          <strong>Thêm bảng Excel</strong>
          <span>Phân tích tạm không ghi vào lịch sử; chỉ khi bấm Lưu vào lịch sử thì kỳ này mới được giữ lại để mở sau.</span>
        </div>
        <div className="file-control">
          <input
            id="excel-file"
            type="file"
            accept=".xlsx,.xlsm"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setData(null)
              setPayrollEmployees([])
              setSelectedCode('')
              setError(null)
              setMessage(null)
            }}
          />
          <label htmlFor="excel-file">{file ? file.name : 'Chọn file Excel'}</label>
        </div>
        <button type="button" disabled={!file || loading} onClick={analyze}>
          {loading ? 'Đang phân tích...' : 'Phân tích tạm'}
        </button>
      </section>

      {data && (
        <section className="period-panel">
          <Input label="Tháng lưu" value={periodMonth} onChange={setPeriodMonth} type="number" />
          <Input label="Năm lưu" value={periodYear} onChange={setPeriodYear} type="number" />
          <button type="button" disabled={historyLoading || !periodMonth || !periodYear} onClick={saveCurrentToHistory}>
            Lưu vào lịch sử
          </button>
          <p className={pendingReviewCount > 0 ? 'save-review-note warning' : 'save-review-note'}>
            {pendingReviewCount > 0
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
              Payroll / Output 2
            </button>
          )}
          <button
            type="button"
            className={activeView === 'history' ? 'active' : ''}
            onClick={() => setActiveView('history')}
          >
            Lịch sử
          </button>
        </nav>
      )}

      {error && <div className="alert">{error}</div>}
      {message && <div className="notice">{message}</div>}

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
          reviewItems={payrollReviewItems}
          latestHistoryInfo={latestHistoryInfo}
          selectedCode={selectedCode}
          form={form}
          loading={payrollLoading}
          onSelect={selectEmployee}
          onFormChange={setForm}
          onReviewItemsChange={setPayrollReviewItems}
          onSavePatches={savePayrollPatches}
          onSave={savePayroll}
          onExport={exportOutput2}
        />
      )}

      {activeView === 'history' && (
        <HistoryView
          periods={historyPeriods}
          detail={historyDetail}
          selectedPeriodId={selectedPeriodId}
          selectedEmployeeCode={historySelectedCode}
          filters={historyFilters}
          searchResults={historySearchResults}
          loading={historyLoading}
          onFiltersChange={setHistoryFilters}
          onSearch={searchEmployeeHistory}
          onRefresh={() => loadHistoryPeriods()}
          onSelectPeriod={selectHistoryPeriod}
          onDeletePeriod={deleteHistoryPeriod}
          onSelectEmployee={setHistorySelectedCode}
          onSelectSearchResult={selectHistorySearchResult}
        />
      )}
    </main>
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

function PayrollView({
  employees,
  attendanceData,
  reviewItems,
  latestHistoryInfo,
  selectedCode,
  form,
  loading,
  onSelect,
  onFormChange,
  onReviewItemsChange,
  onSavePatches,
  onSave,
  onExport,
}: {
  employees: PayrollEmployee[]
  attendanceData: AnalyzeResponse
  reviewItems: PayrollReviewItem[]
  latestHistoryInfo: LatestHistoryInfo
  selectedCode: string
  form: PayrollForm
  loading: boolean
  onSelect: (code: string) => void
  onFormChange: (form: PayrollForm) => void
  onReviewItemsChange: (items: PayrollReviewItem[]) => void
  onSavePatches: (updates: PayrollPatchUpdate[]) => Promise<void>
  onSave: () => void
  onExport: () => void
}) {
  const sortedEmployees = sortPayrollEmployees(employees)
  const latestCodeSet = new Set(latestHistoryInfo.employee_codes)
  const isNewestPeriod = isAnalyzedPeriodNewest(attendanceData.period, latestHistoryInfo.period)
  const newEmployees = sortEmployeesByCode(
    employees.filter(
      (employee) =>
        isNewestPeriod && !latestCodeSet.has(employee.employee_code),
    ),
  )

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
          <span>{employees.length} mã</span>
        </div>
        <div className="status-legend">
          <span><i className="legend-dot complete-dot" />Đủ thông tin</span>
          <span><i className="legend-dot incomplete-dot" />Chưa đủ thông tin</span>
        </div>
        <div className="employee-buttons">
          {sortedEmployees.map((employee) => (
            <button
              type="button"
              key={employee.employee_code}
              className={[
                employee.employee_code === selectedCode ? 'active' : '',
                isPayrollInfoComplete(employee) ? 'employee-status-complete' : 'employee-status-incomplete',
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
          <Input label="Mức lương" value={form.monthly_salary} onChange={(value) => onFormChange({ ...form, monthly_salary: value })} type="number" />
          <Input label="Lương 1 ngày công" value={form.daily_salary} onChange={(value) => onFormChange({ ...form, daily_salary: value })} type="number" />
          <Input label="Số ngày công chuẩn" value={form.standard_work_days} onChange={(value) => onFormChange({ ...form, standard_work_days: value })} type="number" />
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
        </div>
      </div>

      <NewEmployeesPanel
        employees={newEmployees}
        latestPeriodLabel={latestHistoryInfo.period?.label ?? ''}
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
  const missingItems = items.filter((item) => item.type === 'missing')
  const lateItems = items.filter((item) => item.type === 'late')
  const pendingCount = items.filter((item) => item.status === 'pending').length

  function confirmItem(id: string) {
    onChange(items.map((item) => (item.id === id ? { ...item, status: 'ok' } : item)))
  }

  function editItem(id: string) {
    onChange(items.map((item) => (item.id === id ? { ...item, status: 'edited' } : item)))
  }

  function updateItem(id: string, patch: Partial<Pick<PayrollReviewItem, 'value' | 'work_value'>>) {
    onChange(
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              status: 'edited',
            }
          : item,
      ),
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
      <div className="review-grid">
        <ReviewTable
          title="Quên bấm / chưa rõ"
          valueLabel="Ghi chú"
          items={missingItems}
          onConfirm={confirmItem}
          onEdit={editItem}
          onUpdate={updateItem}
        />
        <ReviewTable
          title="Đi trễ"
          valueLabel="Phút trễ"
          items={lateItems}
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
  onSelect,
}: {
  employees: PayrollEmployee[]
  latestPeriodLabel: string
  onSelect: (code: string) => void
}) {
  return (
    <div className="panel new-employees-panel" id="new-employees">
      <div className="panel-heading">
        <h2>Có thể mới / quay lại</h2>
        <span>{employees.length} mã</span>
      </div>
      <p className="panel-note">
        Mã không có trong kỳ lưu gần nhất{latestPeriodLabel ? ` (${latestPeriodLabel})` : ''}; cần kiểm tra thêm trước khi xác nhận là nhân viên mới thật.
      </p>
      <div className="employee-buttons compact-employee-buttons">
        {employees.map((employee) => (
          <button
            type="button"
            key={employee.employee_code}
            className="employee-status-incomplete"
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
                  <td colSpan={5}>Không có dữ liệu</td>
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
  onConfirm,
  onEdit,
  onUpdate,
}: {
  title: string
  valueLabel: string
  items: PayrollReviewItem[]
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
            {items.map((item) => (
              <tr key={item.id} className={item.status === 'pending' ? 'warning-row' : 'selected-row'}>
                <td>{item.employee_code}</td>
                <td>{item.day}</td>
                <td>{item.punches.join(', ')}</td>
                <td>
                  <input
                    className="table-input"
                    value={item.value}
                    placeholder="Xóa"
                    onChange={(event) => onUpdate(item.id, { value: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="table-input"
                    value={item.work_value}
                    placeholder="Xóa"
                    onChange={(event) => onUpdate(item.id, { work_value: event.target.value })}
                  />
                </td>
                <td>{reviewStatusLabel(item.status)}</td>
                <td>
                  <div className="table-actions">
                    <button type="button" onClick={() => onConfirm(item.id)}>OK</button>
                    <button type="button" onClick={() => onEdit(item.id)}>Sửa</button>
                  </div>
                </td>
              </tr>
            ))}
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
  detail,
  selectedPeriodId,
  selectedEmployeeCode,
  filters,
  searchResults,
  loading,
  onFiltersChange,
  onSearch,
  onRefresh,
  onSelectPeriod,
  onDeletePeriod,
  onSelectEmployee,
  onSelectSearchResult,
}: {
  periods: HistoryPeriod[]
  detail: HistoryDetail | null
  selectedPeriodId: string
  selectedEmployeeCode: string
  filters: { employee_code: string; month: string; year: string }
  searchResults: HistorySearchResult[]
  loading: boolean
  onFiltersChange: (filters: { employee_code: string; month: string; year: string }) => void
  onSearch: () => void
  onRefresh: () => void
  onSelectPeriod: (periodId: string) => void
  onDeletePeriod: (periodId: string) => void
  onSelectEmployee: (employeeCode: string) => void
  onSelectSearchResult: (result: HistorySearchResult) => void
}) {
  const selectedEmployee =
    detail?.employees.find((employee) => employee.employee_code === selectedEmployeeCode) ?? detail?.employees[0]

  return (
    <section className="history-layout">
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
          {periods.map((period) => (
            <div
              key={period.id}
              className={['period-item', period.id === selectedPeriodId ? 'active' : ''].join(' ')}
            >
              <button type="button" className="period-main" onClick={() => onSelectPeriod(period.id)}>
                <span>{period.label}</span>
                <small>{period.block_count} mã - {formatDateTime(period.created_at)}</small>
              </button>
              <button
                type="button"
                className="period-delete"
                disabled={loading}
                onClick={() => onDeletePeriod(period.id)}
              >
                Xóa
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel history-detail">
        <div className="panel-heading">
          <h2>Chi tiết kỳ</h2>
          <span>{detail ? detail.period.label : 'Chưa chọn'}</span>
        </div>
        {detail && (
          <>
            <div className="preview-grid history-metrics">
              <Metric label="Nhân viên" value={detail.period.block_count} />
              <Metric label="Ô công" value={detail.period.result_cells} />
              <Metric label="Quên / ?" value={detail.period.missing_cells} />
              <Metric label="Cần kiểm tra" value={detail.period.manual_check_count} />
            </div>
            <div className="history-downloads">
              <a className="download-button" href={historyDownloadUrl(detail.period.id, 'original')}>File gốc</a>
              <a className="download-button" href={historyDownloadUrl(detail.period.id, 'output1')}>Output 1</a>
              <a className="download-button" href={historyDownloadUrl(detail.period.id, 'output2')}>Output 2</a>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Tên</th>
                    <th>Tổng giờ</th>
                    <th>Ngày công</th>
                    <th>Lương tháng</th>
                    <th>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.employees.map((employee) => (
                    <tr
                      key={employee.employee_code}
                      className={employee.employee_code === selectedEmployee?.employee_code ? 'selected-row' : ''}
                      onClick={() => onSelectEmployee(employee.employee_code)}
                    >
                      <td>{employee.employee_code}</td>
                      <td>{employee.employee_name}</td>
                      <td>{formatNumber(employee.total_hours)}</td>
                      <td>{formatNumber(employee.work_days)}</td>
                      <td>{formatMoney(employee.final_salary)}</td>
                      <td>{employee.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="panel history-results">
        <div className="panel-heading">
          <h2>Kết quả tra mã</h2>
          <span>{searchResults.length} dòng</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kỳ</th>
                <th>Mã</th>
                <th>Tên</th>
                <th>Tổng giờ</th>
                <th>Ngày công</th>
                <th>Lương tháng</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map((item) => (
                <tr
                  key={`${item.period_id}-${item.employee_code}`}
                  className={
                    item.period_id === selectedPeriodId && item.employee_code === selectedEmployee?.employee_code
                      ? 'selected-row'
                      : ''
                  }
                  onClick={() => onSelectSearchResult(item)}
                >
                  <td>{item.label}</td>
                  <td>{item.employee_code}</td>
                  <td>{item.employee_name}</td>
                  <td>{formatNumber(item.total_hours)}</td>
                  <td>{formatNumber(item.work_days)}</td>
                  <td>{formatMoney(item.final_salary)}</td>
                </tr>
              ))}
              {!searchResults.length && selectedEmployee && (
                <tr>
                  <td>{detail?.period.label}</td>
                  <td>{selectedEmployee.employee_code}</td>
                  <td>{selectedEmployee.employee_name}</td>
                  <td>{formatNumber(selectedEmployee.total_hours)}</td>
                  <td>{formatNumber(selectedEmployee.work_days)}</td>
                  <td>{formatMoney(selectedEmployee.final_salary)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {selectedEmployee && (
          <EmployeeWorkPanel
            title="Chi tiết công nhân viên"
            employeeCode={selectedEmployee.employee_code}
            rows={historyEmployeeToWorkRows(selectedEmployee)}
            totalHours={selectedEmployee.total_hours}
            workDays={selectedEmployee.work_days}
          />
        )}
      </div>
    </section>
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

function Input({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function emptyPayrollForm(): PayrollForm {
  return {
    employee_code: '',
    name: '',
    monthly_salary: '',
    daily_salary: '',
    standard_work_days: '26',
    bonus: '0',
    advance_or_penalty: '0',
    note: '',
  }
}

function formFromEmployee(employee: PayrollEmployee): PayrollForm {
  return {
    employee_code: employee.employee_code,
    name: employee.name ?? '',
    monthly_salary: employee.monthly_salary ? String(employee.monthly_salary) : '',
    daily_salary: employee.daily_salary_input ? String(employee.daily_salary_input) : '',
    standard_work_days: String(employee.standard_work_days || 26),
    bonus: String(employee.bonus || 0),
    advance_or_penalty: String(employee.advance_or_penalty || 0),
    note: employee.note ?? '',
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
    monthly_salary: parseOptionalNumber(form.monthly_salary),
    daily_salary: parseOptionalNumber(form.daily_salary),
    standard_work_days: parseNumber(form.standard_work_days, 26),
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

function historyEmployeeToWorkRows(employee: HistoryEmployee): WorkDayRow[] {
  return employee.daily_records.map((item) => ({
    day: item.day,
    punches: item.punches,
    work_value: item.work_value,
    missing_count: item.missing_count,
    late_minutes: item.late_minutes,
    manual_checks: [...item.manual_checks, ...(item.review_notes ?? [])],
  }))
}

function isPayrollInfoComplete(employee: PayrollEmployee) {
  const hasName = Boolean((employee.name ?? '').trim())
  const hasSalary = Number(employee.monthly_salary || 0) > 0 || Number(employee.daily_salary_input || 0) > 0
  return hasName && hasSalary
}

function sortPayrollEmployees(employees: PayrollEmployee[]) {
  return [...employees].sort((left, right) => {
    const leftComplete = isPayrollInfoComplete(left)
    const rightComplete = isPayrollInfoComplete(right)
    if (leftComplete !== rightComplete) {
      return leftComplete ? -1 : 1
    }
    return compareEmployeeCode(left.employee_code, right.employee_code)
  })
}

function sortEmployeesByCode(employees: PayrollEmployee[]) {
  return [...employees].sort((left, right) => compareEmployeeCode(left.employee_code, right.employee_code))
}

function isAnalyzedPeriodNewest(current: PeriodInfo, latest: HistoryPeriod | null) {
  if (!current.month || !current.year || !latest) return true
  if (current.year !== latest.year) return current.year > latest.year
  return current.month >= latest.month
}

function compareEmployeeCode(left: string, right: string) {
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber
  }
  return left.localeCompare(right, 'vi')
}

function buildPayrollReviewItems(data: AnalyzeResponse): PayrollReviewItem[] {
  const manualByEmployeeDay = data.manual_checks.reduce<Record<string, string[]>>((acc, item) => {
    const key = `${item.employee_code}-${item.day}`
    acc[key] = [...(acc[key] ?? []), ...item.messages]
    return acc
  }, {})

  return data.blocks.flatMap((block) =>
    block.results.flatMap((result) => {
      const messages = manualByEmployeeDay[`${block.employee_code}-${result.day}`] ?? []
      const base = {
        employee_code: block.employee_code,
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
      return items
    }),
  )
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
    const key = `${item.employee_code}-${item.day}`
    const target = byDay.get(key) ?? { employee_code: item.employee_code, day: item.day, review_notes: [] }
    target.type = item.type
    target.status = item.status
    target.review_notes = [...(target.review_notes ?? []), `${reviewStatusLabel(item.status)}: ${reviewTypeLabel(item.type)}`]
    if (item.type === 'missing') {
      target.missing_count = parseReviewValue(item.value)
    } else {
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
  return type === 'missing' ? 'Quên bấm / chưa rõ' : 'Đi trễ'
}

function totalBlockHours(block: EmployeeBlock) {
  return block.results.reduce((total, item) => {
    return total + (typeof item.work_value === 'number' ? item.work_value : 0)
  }, 0)
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null
  return Number(value)
}

function parseNumber(value: string, fallback: number) {
  if (!value.trim()) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function cleanParams(params: Record<string, string>) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value.trim() !== ''))
}

function historyDownloadUrl(periodId: string, kind: 'original' | 'output1' | 'output2') {
  return `${API_BASE}/history/periods/${periodId}/download/${kind}`
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function readAxiosError(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.detail ?? err.message
  }
  return fallback
}

export default App
