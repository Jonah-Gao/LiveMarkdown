export function sanitizeHtml(html: string): string {
    try {
        if (typeof DOMParser === 'undefined') {
            return html.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        doc.querySelectorAll('script,style').forEach(el => el.remove());
        doc.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                if (attr.name.toLowerCase().startsWith('on')) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return doc.body.innerHTML;
    } catch {
        return '';
    }
}
