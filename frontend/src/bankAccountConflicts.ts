type AccountRow = { employee_code: string; account_number: string }

export function bankAccountConflictCodes(
  employeeCode: string,
  accountNumber: string,
  rows: AccountRow[],
  warehouseRows: AccountRow[] = [],
) {
  const account = accountNumber.replace(/\D/g, '')
  if (!account) return []
  // Current edits supersede the saved account for the same employee.
  const currentAccounts = new Map([...warehouseRows, ...rows].map((row) => [row.employee_code, row]))
  return [...new Set([...currentAccounts.values()]
    .filter((item) => item.employee_code !== employeeCode && item.account_number.replace(/\D/g, '') === account)
    .map((item) => item.employee_code))]
    .sort((left, right) => Number(left) - Number(right) || left.localeCompare(right))
}
