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
  updatePlan: (id, plan) => api.put(`/bots/${id}/plan`, { plan }).then(r => r.data),
};

export const templatesApi = {
  list: () => api.get('/templates').then(r => r.data),
  get: rubric => api.get(`/templates/${rubric}`).then(r => r.data),
};

export default api;
