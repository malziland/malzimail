// Barrel: the view layer is split into src/views/*. Kept so existing imports
// (import { render... } from './pages.js') keep working.
export { renderImpressum, renderDatenschutz, renderNutzungsbedingungen } from './views/legal.js';
export { renderAdminLogin, renderSetupPassword, renderPasswordChange,
  renderGoogleModal, renderSetupOperator, renderSetupGoogle, renderWorkshopDashboard, systemCheckCells } from './views/admin.js';
