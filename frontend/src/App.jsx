import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from './context/ThemeContext';
import { Sun, Moon, Download, LogOut, Loader2, AlertCircle, User as UserIcon } from 'lucide-react';
import ChatContainer from './components/ChatContainer';
import { io } from 'socket.io-client';

const API_BASE_URL = 'http://localhost:3000/api';
const SOCKET_URL = 'http://localhost:3000';
const VAPID_PUBLIC_KEY = 'BJA70RLbPhWeENV4TRlwf2ZTd4UcuWkzR9RLZuqDxO5CLVa-4qu_ghfNnk9Jvqf-4yZD67HXqQtQIq0Qwg_IWho';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function App() {
  const { isDarkMode, toggleTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [socket, setSocket] = useState(null);
  
  // Login states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  
  // PWA install states
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(true);

  // Load user profile if token exists
  useEffect(() => {
    if (token) {
      fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error('Session expired');
          return res.json();
        })
        .then((data) => {
          setUser(data);
          subscribeToPushNotifications(token);
        })
        .catch((err) => {
          console.error(err);
          handleLogout();
        });
    }
  }, [token]);

  // Track PWA install banner
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      console.log('beforeinstallprompt event triggered.');
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Socket connection manager
  useEffect(() => {
    if (token && user) {
      const newSocket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
      });

      newSocket.on('connect', () => {
        console.log('Connected to socket server.');
      });

      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
      };
    }
  }, [token, user]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setLoginError('Email and password are required.');
      return;
    }

    setLoginLoading(true);
    setLoginError('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Invalid email or password.');
      }

      localStorage.setItem('token', data.accessToken);
      setToken(data.accessToken);
      setUser(data.user);
      subscribeToPushNotifications(data.accessToken);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
  };

  const subscribeToPushNotifications = async (jwtToken) => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications are not supported in this browser.');
      return;
    }

    try {
      // Register service worker if not registered or wait till it is ready
      const registration = await navigator.serviceWorker.ready;
      
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Request notifications permission if not granted
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.warn('Notification permission denied.');
          return;
        }

        const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      // Sync subscription with NestJS backend
      await fetch(`${API_BASE_URL}/notifications/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify(subscription),
      });

      console.log('Web push notification subscription synced successfully.');
    } catch (err) {
      console.error('Failed to subscribe user to push notifications:', err);
    }
  };

  const triggerInstall = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the PWA install prompt.');
        } else {
          console.log('User dismissed the PWA install prompt.');
        }
        setInstallPrompt(null);
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950 transition-colors duration-300 overflow-hidden">
      {/* Header bar */}
      <header className="glass-header sticky top-0 z-40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="DoTalk Logo" className="w-8 h-8 rounded-lg object-contain" />
          <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
            DoTalk
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Light/Dark Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition smooth-hover"
            aria-label="Toggle Theme"
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {user && (
            <button
              onClick={handleLogout}
              className="p-2.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition smooth-hover flex items-center gap-2 text-sm font-medium"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          )}
        </div>
      </header>

      {/* PWA Install Banner */}
      {installPrompt && showInstallBanner && (
        <div className="bg-gradient-to-r from-blue-600 to-sky-500 text-white px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl">
              <Download size={20} />
            </div>
            <div>
              <p className="font-semibold text-sm">Install DoTalk PWA</p>
              <p className="text-xs opacity-90">Install on your home screen for offline access and instant push notifications.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={triggerInstall}
              className="bg-white text-blue-600 px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-100 transition shadow"
            >
              Install Now
            </button>
            <button
              onClick={() => setShowInstallBanner(false)}
              className="text-white/80 hover:text-white px-3 py-1.5 rounded-lg text-xs transition"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {user ? (
          <ChatContainer user={user} token={token} socket={socket} apiUrl={API_BASE_URL} />
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="max-w-md w-full glass-card rounded-2xl shadow-xl overflow-hidden p-8 md:p-10">
              <div className="text-center mb-8 flex flex-col items-center">
                <img src="/logo.png" alt="DoTalk Logo" className="w-16 h-16 rounded-2xl object-contain mb-4 shadow-md shadow-blue-500/10" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">DoTalk</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Access your team collaboration channels
                </p>
              </div>

              {loginError && (
                <div className="mb-5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-3 flex items-start gap-2.5 text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
                    placeholder="Enter your email"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
                    placeholder="Enter your password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-blue-600 transition duration-200 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {loginLoading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </form>

              <div className="text-center mt-6">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Demo logins: john@example.com / password123
                </span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
