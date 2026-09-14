import 'bootstrap-italia/dist/css/bootstrap-italia.min.css';
import 'bootstrap-italia/dist/plugins/init.js';
import Collapse from 'bootstrap-italia/dist/plugins/collapse.js';
import Dropdown from 'bootstrap-italia/dist/plugins/dropdown.js';
import Offcanvas from 'bootstrap-italia/dist/plugins/offcanvas.js';

const api = { Collapse, Dropdown, Offcanvas };
if (typeof window !== 'undefined') {
  window.bootstrap = { ...(window.bootstrap || {}), ...api };
}

export { Collapse, Dropdown, Offcanvas };
