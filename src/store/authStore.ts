import { apiRequest, jsonBody } from '../services/apiClient';

export interface User {
  id: string;
  username: string;
  displayName: string;
}

interface AuthState {
  token: string | null;
  currentUser: User | null;
  isAuthenticated: boolean;
}

// Global responsive-like state (simple singleton object)
const state: AuthState = {
  token: localStorage.getItem('diary-token'),
  currentUser: null,
  isAuthenticated: false,
};

// Try loading user from local storage
const cachedUser = localStorage.getItem('diary-user');
if (cachedUser) {
  try {
    state.currentUser = JSON.parse(cachedUser);
    state.isAuthenticated = !!state.token;
  } catch {
    localStorage.removeItem('diary-user');
  }
}

export function getToken(): string | null {
  return state.token;
}

export function getCurrentUser(): User | null {
  return state.currentUser;
}

export function isAuthenticated(): boolean {
  return state.isAuthenticated;
}

/**
 * Update state and local storage token
 */
export function setAuthToken(token: string | null): void {
  state.token = token;
  if (token) {
    localStorage.setItem('diary-token', token);
    state.isAuthenticated = true;
  } else {
    localStorage.removeItem('diary-token');
    state.isAuthenticated = false;
  }
}

/**
 * Update state and local storage user
 */
export function setCurrentUser(user: User | null): void {
  state.currentUser = user;
  if (user) {
    localStorage.setItem('diary-user', JSON.stringify(user));
  } else {
    localStorage.removeItem('diary-user');
  }
}

/**
 * Login action
 */
export async function login(username: string, password: string): Promise<User> {
  interface LoginResponse {
    token: string;
    user: User;
  }

  const res = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: jsonBody({ username, password }),
  });

  setAuthToken(res.token);
  setCurrentUser(res.user);
  return res.user;
}

/**
 * Register action
 */
export async function register(username: string, password: string, displayName: string): Promise<void> {
  await apiRequest<void>('/auth/register', {
    method: 'POST',
    body: jsonBody({ username, password, displayName }),
  });
}

/**
 * Logout action
 */
export function logout(): void {
  setAuthToken(null);
  setCurrentUser(null);
  sessionStorage.removeItem('list-scroll-top');
  
  // Safely trigger routing to login by modifying hash
  window.location.hash = '#/login';
}

/**
 * Verify token and fetch profile
 */
export async function checkAuth(): Promise<User | null> {
  const token = getToken();
  if (!token) {
    logout();
    return null;
  }

  try {
    const user = await apiRequest<User>('/auth/me');
    setCurrentUser(user);
    state.isAuthenticated = true;
    return user;
  } catch (error) {
    console.error('Session verification failed:', error);
    logout();
    return null;
  }
}

/**
 * Change user password
 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiRequest<void>('/auth/change-password', {
    method: 'POST',
    body: jsonBody({ oldPassword, newPassword }),
  });
}
