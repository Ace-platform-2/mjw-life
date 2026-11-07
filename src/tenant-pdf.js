import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';

pdfMake.addVirtualFileSystem(pdfFonts);

const lines = values => (values || []).join('\n');
const headers = ['Shop / Unit', 'Tenant', 'Contact', 'Phone', 'Email'];

export function tenantDirectoryPdf(buildings, tenants, day) {
  const date = new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' })
    .format(new Date(day + 'T12:00:00Z'));
  const groups = buildings.map(building => ({
    building, tenants: tenants.filter(tenant => tenant.buildingId === building.id)
      .sort((a, b) => a.title.localeCompare(b.title, 'en-ZA', { numeric: true })),
  }));
  const total = groups.reduce((count, group) => count + group.tenants.length, 0);
  return pdfMake.createPdf({
    info: { title: 'FPG Tenant Directory', author: 'MJW Life' },
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [32, 56, 32, 42],
    defaultStyle: { fontSize: 9.5, color: '#182638' },
    header: {
      margin: [32, 19, 32, 0],
      columns: [
        { stack: [{ text: 'FPG PROPERTY MANAGEMENT', fontSize: 8, bold: true, color: '#186759' },
          { text: 'Tenant directory', fontSize: 16, bold: true }] },
        { text: total + (total === 1 ? ' tenant' : ' tenants') + '  |  ' + date, alignment: 'right', margin: [0, 12, 0, 0] },
      ],
    },
    footer: (page, pages) => ({
      margin: [32, 14, 32, 0],
      columns: [{ text: 'MJW Life  |  FPG', color: '#435368' },
        { text: 'Page ' + page + ' of ' + pages, alignment: 'right', color: '#435368' }],
      fontSize: 8.5,
    }),
    content: groups.map(({ building, tenants: entries }, index) => ({
      pageBreak: index ? 'before' : undefined,
      table: {
        headerRows: 2,
        widths: ['11%', '26%', '18%', '20%', '*'],
        body: [
          [{ text: [building.title, building.code, entries.length + (entries.length === 1 ? ' tenant' : ' tenants')]
            .filter(Boolean).join('  |  '), colSpan: 5, bold: true, fontSize: 12, color: '#ffffff', fillColor: '#17334a' }, {}, {}, {}, {}],
          headers.map(text => ({ text, bold: true, color: '#17334a', fillColor: '#e5f2ef' })),
          ...entries.map(tenant => [
            lines(tenant.units),
            { stack: [{ text: tenant.title, bold: true }, ...(tenant.aliases?.length ? [{ text: lines(tenant.aliases), color: '#435368' }] : [])] },
            lines(tenant.contacts), lines(tenant.phones), lines(tenant.emails),
          ]),
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        hLineColor: () => '#c9d3dc',
        vLineWidth: () => 0,
        paddingLeft: () => 7,
        paddingRight: () => 7,
        paddingTop: () => 5,
        paddingBottom: () => 5,
      },
    })),
  });
}
