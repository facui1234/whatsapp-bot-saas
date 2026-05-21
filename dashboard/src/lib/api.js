import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export const botsApi = {
  list: () => api.get('/bots').then(r => r.data),
  get: id => api.get(`/bots/${id}`).then(r => r.data),
  create: data => api.post('/bots', data).then(r => r.data),
  update: (id, data) => api.put(`/bots/${id}`, data).then(r => r.data),
  delete: id => api.delete(`/bots/${id}`).then(r => r.data),
  getHistory: (id, params) => api.get(`/bots/${id}/history`, { params }).then(r => r.data),
  getConversations: id => api.get(`/bots/${id}/conversations`).then(r => r.data),
  uploadFaqs: (id, faqs) => api.post(`/bots/${id}/faqs`, { faqs }).then(r => r.data),
  updatePlan:  (id, plan)        => api.put(`/bots/${id}/plan`, { plan }).then(r => r.data),
  syncOneKb:   (id, kbId)       => api.post(`/bots/${id}/kb/${kbId}/sync`).then(r => r.data),
  syncAllKbs:  id               => api.post(`/bots/${id}/kb/sync`).then(r => r.data),
};

export const templatesApi = {
  list: () => api.get('/templates').then(r => r.data),
  get: rubric => api.get(`/templates/${rubric}`).then(r => r.data),
};

export const clientsApi = {
  list: params => api.get('/clients', { params }).then(r => r.data),
  get: id => api.get(`/clients/${id}`).then(r => r.data),
  create: data => api.post('/clients', data).then(r => r.data),
  update: (id, data) => api.put(`/clients/${id}`, data).then(r => r.data),
  delete: id => api.delete(`/clients/${id}`).then(r => r.data),
  getBots: id => api.get(`/clients/${id}/bots`).then(r => r.data),
  getInvoices: id => api.get(`/clients/${id}/invoices`).then(r => r.data),
  generateInvoice: id => api.post(`/clients/${id}/invoice/generate`).then(r => r.data),
  updateInvoiceStatus: (id, invoiceId, status) => api.put(`/clients/${id}/invoice/${invoiceId}/status`, { status }).then(r => r.data),
  updatePlan: (id, plan) => api.put(`/clients/${id}/plan`, { plan }).then(r => r.data),
  resetMonth: id => api.post(`/clients/${id}/reset-month`).then(r => r.data),
};

export const reportsApi = {
  monthly: () => api.get('/reports/monthly').then(r => r.data),
  monthlyCsvUrl: () => '/api/reports/monthly/csv',
};

export const analyticsApi = {
  summary:  params => api.get('/analytics/summary',  { params }).then(r => r.data),
  hours:    params => api.get('/analytics/hours',    { params }).then(r => r.data),
  days:     params => api.get('/analytics/days',     { params }).then(r => r.data),
  daily:    params => api.get('/analytics/daily',    { params }).then(r => r.data),
  keywords: params => api.get('/analytics/keywords', { params }).then(r => r.data),
  bots:     params => api.get('/analytics/bots',     { params }).then(r => r.data),
};

export const adminApi = {
  health: () => api.get('/admin/health').then(r => r.data),
  stats: () => api.get('/admin/stats').then(r => r.data),
  logs: (params) => api.get('/admin/logs', { params }).then(r => r.data),
  testBot: (id, message, history) => api.post(`/admin/bots/${id}/test`, { message, history }).then(r => r.data),
  resetCounter: id => api.delete(`/admin/bots/${id}/reset`).then(r => r.data),
  clearConversations: id => api.delete(`/admin/bots/${id}/conversations`).then(r => r.data),
};

export default api;
