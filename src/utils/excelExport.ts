import * as XLSX from 'xlsx';

interface ExcelColumn {
    header: string;
    key: string;
    width?: number;
    /** Format numbers with separator */
    numeric?: boolean;
}

interface ExcelExportOptions {
    filename: string;
    sheetName?: string;
    columns: ExcelColumn[];
    rows: Record<string, any>[];
    /** Optional title row at the top */
    title?: string;
    /** Optional subtitle (e.g. date range) */
    subtitle?: string;
}

/**
 * Export data to Excel (.xlsx) file
 */
export function exportToExcel({
    filename,
    sheetName = 'Отчёт',
    columns,
    rows,
    title,
    subtitle,
}: ExcelExportOptions) {
    const wb = XLSX.utils.book_new();

    // Build data array
    const data: any[][] = [];

    // Title rows
    if (title) {
        data.push([title]);
        data.push([]);
    }
    if (subtitle) {
        data.push([subtitle]);
        data.push([]);
    }

    // Header row
    data.push(columns.map(c => c.header));

    // Data rows
    for (const row of rows) {
        data.push(columns.map(c => {
            const val = row[c.key];
            if (val === undefined || val === null) return '';
            return val;
        }));
    }

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    ws['!cols'] = columns.map(c => ({ wch: c.width || 15 }));

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Quick export: just headers + rows, auto-download
 */
export function quickExport(
    filename: string,
    headers: string[],
    rows: (string | number)[][],
    sheetName = 'Отчёт',
) {
    const wb = XLSX.utils.book_new();
    const data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = headers.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
}
