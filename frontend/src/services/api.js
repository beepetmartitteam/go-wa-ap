import axios from 'axios';
import io from 'socket.io-client';

const API_BASE_URL = 'http://51.79.188.203:8090/api';
const WEBSOCKET_URL = 'http://51.79.188.203:8090';

// WebSocket client
export const socket = io(WEBSOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
  maxReconnectionAttempts: 5
});

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // Use React Router's navigate instead of hard redirect
      // This will be handled by the AuthContext
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  me: () => api.get('/auth/me'),
};

export const phonesAPI = {
  getPhones: () => api.get('/phones'),
  createPhone: (data) => api.post('/phones', data),
  updatePhone: (id, data) => api.put(`/phones/${id}`, data),
  deletePhone: (id) => api.delete(`/phones/${id}`),
  generateQR: (id) => api.post(`/phones/${id}/generate-qr`),
  getPhoneStatus: (id) => api.get(`/phones/${id}/status`),
  disconnectPhone: (id) => api.post(`/phones/${id}/disconnect`),
};

export const templatesAPI = {
  getTemplates: () => api.get('/templates'),
  createTemplate: (data) => api.post('/templates', data),
  updateTemplate: (id, data) => api.put(`/templates/${id}`, data),
  deleteTemplate: (id) => api.delete(`/templates/${id}`),
  processTemplate: (id, variables) => api.post(`/templates/${id}/process`, variables)
};

export const contactsAPI = {
  getContacts: (params) => api.get('/contacts', { params }),
  getContact: (id) => api.get(`/contacts/${id}`),
  createContact: (data) => api.post('/contacts', data),
  updateContact: (id, data) => api.put(`/contacts/${id}`, data),
  deleteContact: (id) => api.delete(`/contacts/${id}`),
  importContacts: (data) => api.post('/contacts/import', data),
  exportContacts: (params) => api.get('/contacts/export', { params }),
  bulkDelete: (contactIds) => api.post('/contacts/bulk-delete', { contactIds }),
  bulkUpdateCategory: (contactIds, categoryId) => api.post('/contacts/bulk-category', { contactIds, categoryId })
};

export const categoriesAPI = {
  getCategories: () => api.get('/categories'),
  getCategory: (id) => api.get(`/categories/${id}`),
  createCategory: (data) => api.post('/categories', data),
  updateCategory: (id, data) => api.put(`/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/categories/${id}`)
};

// Get API Keys and Number Keys for current user
export const getApiKeys = async () => {
  try {
    const response = await api.get('/users/api-keys');
    return response.data;
  } catch (error) {
    console.error('Error fetching API keys:', error);
    throw error;
  }
};

// Get Phone Numbers with Number Keys for current user
export const getPhoneNumbersWithKeys = async () => {
  try {
    const response = await api.get('/phones/with-keys');
    return response.data;
  } catch (error) {
    console.error('Error fetching phone numbers with keys:', error);
    throw error;
  }
};

// Generate new API Key for user
export const generateApiKey = async () => {
  try {
    const response = await api.post('/users/generate-api-key');
    return response.data;
  } catch (error) {
    console.error('Error generating API key:', error);
    throw error;
  }
};

// Generate new Number Key for phone
export const generateNumberKey = async (phoneId) => {
  try {
    const response = await api.post(`/phones/${phoneId}/generate-number-key`);
    return response.data;
  } catch (error) {
    console.error('Error generating number key:', error);
    throw error;
  }
};

export const schedulesAPI = {
  getSchedules: () => api.get('/schedules'),
  createSchedule: (data) => api.post('/schedules', data),
  updateSchedule: (id, data) => api.put(`/schedules/${id}`, data),
  deleteSchedule: (id) => api.delete(`/schedules/${id}`),
  processSchedules: () => api.post('/schedules/process')
};

export const externalWhatsAppAPI = {
  getProviders: () => api.get('/external-whatsapp/providers'),
  sendMessage: (data) => api.post('/external-whatsapp/send', data),
  getStatus: (data) => api.post('/external-whatsapp/status', data),
  testProvider: (data) => api.post('/external-whatsapp/test', data)
};

export const messagesAPI = {
  getMessages: (params) => api.get('/messages', { params }),
  sendMessage: (data) => api.post('/messages/send', data),
};

export const statsAPI = {
  getDashboard: () => api.get('/stats/dashboard'),
  getMessageStats: (period) => api.get('/stats/messages', { params: { period } }),
  getPhoneStats: () => api.get('/stats/phones'),
  getWebhookStats: (period) => api.get('/stats/webhooks', { params: { period } }),
};

export const autoReplyAPI = {
  getPhoneNumbers: () => api.get('/auto-reply/phone-numbers'),
  getConfigs: () => api.get('/auto-reply'),
  getConfig: (id) => api.get(`/auto-reply/${id}`),
  createConfig: (data) => api.post('/auto-reply', data),
  updateConfig: (id, data) => api.put(`/auto-reply/${id}`, data),
  deleteConfig: (id) => api.delete(`/auto-reply/${id}`),
  testConfig: (id, data) => api.post(`/auto-reply/${id}/test`, data),
  getAnalytics: (id) => api.get(`/auto-reply/${id}/analytics`)
};

export const broadcastsAPI = {
  getBroadcasts: (params) => api.get('/broadcasts', { params }),
  getBroadcast: (id) => api.get(`/broadcasts/${id}`),
  createBroadcast: (data) => api.post('/broadcasts', data),
  updateBroadcast: (id, data) => api.put(`/broadcasts/${id}`, data),
  deleteBroadcast: (id) => api.delete(`/broadcasts/${id}`),
  getBroadcastProgress: (id) => api.get(`/broadcasts/${id}/progress`),
  startBroadcast: (id) => api.post(`/broadcasts/${id}/start`),
  stopBroadcast: (id) => api.post(`/broadcasts/${id}/stop`),
  getBroadcastQueue: () => api.get('/broadcasts/queue'),
  getBroadcastStatus: (id) => api.get(`/broadcasts/${id}/status`),
  getBroadcastRecipients: (id) => api.get(`/broadcasts/${id}/recipients`)
};

export const broadcastTemplatesAPI = {
  getTemplates: () => api.get('/broadcast-templates'),
  getTemplate: (id) => api.get(`/broadcast-templates/${id}`),
  createTemplate: (data) => api.post('/broadcast-templates', data),
  updateTemplate: (id, data) => api.put(`/broadcast-templates/${id}`, data),
  deleteTemplate: (id) => api.delete(`/broadcast-templates/${id}`)
};

export const subscriptionAPI = {
  getSubscription: () => api.get('/subscription/info'),
  canAddPhone: () => api.get('/subscription/can-add-phone'),
  getPlans: () => api.get('/subscription/plans'),
  upgradePlan: (planId) => api.post('/subscription/upgrade', { plan_id: planId }),
};

export default api;
