import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { authAPI } from '../services/api';

// Direct API configuration
const API_BASE_URL = 'http://51.79.188.203:8090/api/';

const AuthContext = createContext();

const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, loading: true, error: null };
    case 'LOGIN_SUCCESS':
      return { 
        ...state, 
        loading: false, 
        user: action.payload.user, 
        token: action.payload.token,
        isAuthenticated: true 
      };
    case 'LOGIN_FAILURE':
      return { 
        ...state, 
        loading: false, 
        error: action.payload, 
        isAuthenticated: false 
      };
    case 'LOGOUT':
      return { 
        ...state, 
        user: null, 
        token: null, 
        isAuthenticated: false 
      };
    default:
      return state;
  }
};

const initialState = {
  user: null,
  token: localStorage.getItem('token'),
  loading: true, // Start with loading true to check session
  error: null,
  isAuthenticated: false,
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check session on app load
  useEffect(() => {
    const checkSession = async () => {
      const token = localStorage.getItem('token');
      
      if (token) {
        try {
          // Verify token by making a request to get user info
          const response = await authAPI.me();
          
          if (response.data && response.data.user) {
            dispatch({ 
              type: 'LOGIN_SUCCESS', 
              payload: { 
                token, 
                user: response.data.user 
              } 
            });
          } else {
            // Token invalid, clear it
            localStorage.removeItem('token');
            dispatch({ type: 'LOGOUT' });
          }
        } catch (error) {
          // Token invalid or expired, clear it
          localStorage.removeItem('token');
          dispatch({ type: 'LOGOUT' });
        }
      } else {
        // No token, set loading to false
        dispatch({ type: 'LOGIN_FAILURE', payload: null });
      }
    };

    checkSession();
  }, []);

  useEffect(() => {
    if (state.token) {
      localStorage.setItem('token', state.token);
    } else {
      localStorage.removeItem('token');
    }
  }, [state.token]);

  const login = async (credentials) => {
    dispatch({ type: 'LOGIN_START' });
    try {
      const response = await authAPI.login(credentials);
      const { token, user } = response.data;
      dispatch({ type: 'LOGIN_SUCCESS', payload: { token, user } });
      return response.data;
    } catch (error) {
      dispatch({ type: 'LOGIN_FAILURE', payload: error.response?.data?.error || 'Login failed' });
      throw error;
    }
  };

  const logout = () => {
    dispatch({ type: 'LOGOUT' });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
