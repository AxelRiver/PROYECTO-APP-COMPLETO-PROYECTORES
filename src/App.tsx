/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  signOut, 
  onAuthStateChanged, 
  FirebaseUser,
  collection,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  query,
  where,
  Timestamp
} from './firebase';
import { 
  LogIn, 
  LogOut, 
  Monitor, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  User,
  Sun,
  Moon,
  Info,
  ChevronRight,
  Search,
  Settings,
  Filter,
  MoreVertical,
  AlertCircle,
  Bell,
  ExternalLink,
  Smartphone
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Projector {
  id: string;
  name: string;
  status: 'available' | 'reserved' | 'maintenance' | 'out-of-service';
  currentReservationId?: string;
  location: string;
  roomId: string;
  model: string;
  resolution: string;
  bulbHours: number;
  serialNumber: string;
}

interface Reservation {
  id: string;
  projectorId: string;
  userId: string;
  userName: string;
  startTime: any;
  endTime?: any;
  status: 'active' | 'completed' | 'cancelled';
}

function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  // Loading timeout
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        setLoadingTimeout(true);
      }
    }, 10000); // 10 seconds
    return () => clearTimeout(timer);
  }, [loading]);
  const [projectors, setProjectors] = useState<Projector[]>([]);
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);
  const [allMyReservations, setAllMyReservations] = useState<Reservation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'reservations' | 'profile'>('home');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window !== 'undefined') {
      const installed = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
      // console.log('Initial PWA installation state:', installed);
      return installed;
    }
    return false;
  });
  const [swStatus, setSwStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isInIframe, setIsInIframe] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  // Check if app is already installed
  useEffect(() => {
    const checkInstalled = () => {
      if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
        setIsInstalled(true);
      }
    };
    checkInstalled();
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      (window as any).deferredPrompt = null;
      addToast('¡Aplicación instalada con éxito!', 'success');
    });
  }, []);

  const [toasts, setToasts] = useState<{id: string, message: string, type: 'success' | 'error'}[]>([]);
  const [confirmingProjector, setConfirmingProjector] = useState<Projector | null>(null);
  const [isReserving, setIsReserving] = useState(false);
  const [editingProjector, setEditingProjector] = useState<Projector | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Dark Mode Effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const addToast = (message: string, type: 'success' | 'error' = 'success') => {
    // console.log(`Toast [${type}]: ${message}`);
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const requestNotificationPermission = async () => {
    // console.log('Requesting notification permission...');
    if (!('Notification' in window)) {
      // console.log('Notifications not supported in this browser');
      addToast('Tu navegador no soporta notificaciones', 'error');
      return;
    }
    const permission = await Notification.requestPermission();
    // console.log('Notification permission result:', permission);
    setNotificationPermission(permission);
    if (permission === 'granted') {
      addToast('Notificaciones activadas', 'success');
      sendNotification('¡Listo!', { body: 'Las notificaciones están activadas.' });
    }
  };

  const sendNotification = (title: string, options?: any) => {
    // console.log(`Attempting to send notification: ${title}`);
    if (notificationPermission !== 'granted') {
      // console.log('Notification permission not granted');
      return;
    }
    
    const defaultOptions: any = {
      icon: 'https://cdn-icons-png.flaticon.com/512/3067/3067451.png',
      badge: 'https://cdn-icons-png.flaticon.com/192/3067/3067451.png',
      vibrate: [200, 100, 200],
      ...options
    };

    if ('serviceWorker' in navigator) {
      // console.log('Sending notification via Service Worker...');
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, defaultOptions);
      });
    } else {
      // console.log('Sending notification via Browser API...');
      new Notification(title, defaultOptions);
    }
  };

  useEffect(() => {
    setIsInIframe(window.self !== window.top);
    
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    if ('serviceWorker' in navigator) {
      setSwStatus('ready');
    } else {
      setSwStatus('error');
    }
  }, []);

  // PWA Install Prompt
  useEffect(() => {
    // Check if it's already captured in index.html
    if ((window as any).deferredPrompt) {
      setDeferredPrompt((window as any).deferredPrompt);
    }

    const handler = (e: any) => {
      // console.log('beforeinstallprompt event captured');
      e.preventDefault();
      setDeferredPrompt(e);
      (window as any).deferredPrompt = e;
    };
    
    const customHandler = (e: any) => {
      if (e.detail) {
        // console.log('pwa-prompt-ready custom event captured');
        setDeferredPrompt(e.detail);
      }
    };
    
    // Listen for the event
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('pwa-prompt-ready', customHandler as any);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('pwa-prompt-ready', customHandler as any);
    };
  }, []);

  const handleInstallClick = async () => {
    // console.log('Install button clicked');
    if (isInstalled) {
      // console.log('App already installed, skipping prompt');
      addToast('La aplicación ya está instalada.', 'success');
      return;
    }

    const prompt = deferredPrompt || (window as any).deferredPrompt;
    // console.log('Prompt state:', prompt ? 'Available' : 'Not available');

    if (!prompt) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      // console.log('Platform is iOS:', isIOS);
      if (isIOS) {
        addToast('En iPhone: Toca el icono de "Compartir" (cuadrado con flecha) y elige "Añadir a pantalla de inicio".', 'success');
      } else {
        addToast('Instrucción: Toca los 3 puntos del navegador (arriba a la derecha) y selecciona "Instalar aplicación" o "Añadir a la pantalla de inicio".', 'success');
      }
      return;
    }

    try {
      // console.log('Showing install prompt...');
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      // console.log('User choice outcome:', outcome);
      if (outcome === 'accepted') {
        // console.log('User accepted the install prompt');
        setDeferredPrompt(null);
        (window as any).deferredPrompt = null;
        setIsInstalled(true);
      }
    } catch (err) {
      // console.error('Error during installation:', err);
      addToast('Error al abrir el instalador', 'error');
    }
  };

  // Auth Listener
  useEffect(() => {
    // console.log('Setting up Auth Listener...');
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      // console.log('Auth state changed:', u ? `User: ${u.email}` : 'No user');
      
      // Ensure loading is set to false as soon as we have an auth state
      setLoading(false);
      setUser(u);
      
      if (u) {
        setIsAdmin(u.email === 'axelrivera635@gmail.com');
        
        // Notification logic in a separate async block to not block the main thread
        (async () => {
          try {
            // Get device info safely
            const ua = navigator.userAgent || '';
            const device = ua.includes('Android') ? 'Android' : 
                           ua.includes('iPhone') ? 'iPhone' : 'PC / Laptop';
            
            // Get approximate location safely
            let location = 'Desconocida';
            try {
              // console.log('Fetching geolocation...');
              const geoRes = await fetch('https://ipapi.co/json/');
              if (geoRes.ok) {
                const geoData = await geoRes.json();
                location = `${geoData.city || 'Ciudad desconocida'}, ${geoData.country_name || 'País desconocido'}`;
                // console.log('Geolocation success:', location);
              } else {
                // console.log('Geolocation failed with status:', geoRes.status);
              }
            } catch (e) {
              // console.log('Geolocation error:', e);
              // Could not fetch location
            }

            // Call backend notification only if email is present
            if (u.email) {
              fetch('/api/notify-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: u.email,
                  device: device,
                  location: location,
                  time: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
                })
              }).catch(() => {});
            }

            // Welcome Notification (Browser API)
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('¡Bienvenido a Proyectores Pro!', {
                body: `Hola ${u.displayName}, el sistema está listo.`,
                icon: 'https://cdn-icons-png.flaticon.com/512/3067/3067451.png'
              });
            }
          } catch (err) {
            // Error in post-login logic
          }
        })();

        addToast(`¡Bienvenido, ${u.displayName}!`, 'success');
      }
    });
    return () => unsubscribe();
  }, []);

  // Initialize Projectors if they don't exist
  useEffect(() => {
    if (!user) return;

    const initProjectors = async () => {
      if (!isAdmin) return; // Only admins can initialize
      
      try {
        const models = ['Epson EB-L520U', 'Sony VPL-FHZ80', 'BenQ LU930', 'Optoma ZU506T', 'ViewSonic LS830'];
        const resolutions = ['WUXGA (1920x1200)', '4K UHD', 'Full HD 1080p'];
        
        const batch = [];
        for (let roomNum = 1; roomNum <= 10; roomNum++) {
          for (let projNum = 1; projNum <= 5; projNum++) {
            const pId = `room-${roomNum}-proj-${projNum}`;
            const pRef = doc(db, 'projectors', pId);
            const pSnap = await getDoc(pRef);
            
            if (!pSnap.exists()) {
              const isMaintenance = Math.random() < 0.1; // 10% chance
              batch.push(setDoc(pRef, {
                id: pId,
                name: `Proyector ${projNum} - Sala ${roomNum}`,
                status: isMaintenance ? 'maintenance' : 'available',
                location: `Sala de Cine ${roomNum}`,
                roomId: `Sala ${roomNum}`,
                model: models[(roomNum + projNum) % models.length],
                resolution: resolutions[(roomNum + projNum) % resolutions.length],
                bulbHours: Math.floor(Math.random() * 2000),
                serialNumber: `SN-${roomNum}-${projNum}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`
              }));
            }
          }
        }
        if (batch.length > 0) {
          await Promise.all(batch);
          addToast(`Sistema inicializado: 50 proyectores creados`, 'success');
        }
      } catch (err) {
        // Error initializing projectors
      }
    };
    initProjectors();
  }, [user, isAdmin]);

  // Listen to Projectors
  useEffect(() => {
    if (!user) return;
    // console.log('Setting up Projectors Snapshot...');

    const unsubscribe = onSnapshot(collection(db, 'projectors'), (snapshot) => {
      // console.log(`Projectors snapshot received: ${snapshot.size} documents`);
      const projs = snapshot.docs.map(d => ({ ...d.data() } as Projector));
      setProjectors(projs.sort((a, b) => a.id.localeCompare(b.id)));
    }, (err) => {
      // console.error('Projectors snapshot error:', err);
      setError("Error al cargar proyectores. Verifica los permisos.");
    });

    return () => unsubscribe();
  }, [user]);

  // Listen to My Reservations (Active)
  useEffect(() => {
    if (!user) {
      setMyReservations([]);
      return;
    }
    // console.log('Setting up My Reservations Snapshot...');

    const q = query(
      collection(db, 'reservations'),
      where('userId', '==', user.uid),
      where('status', '==', 'active')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // console.log(`My Reservations snapshot received: ${snapshot.size} documents`);
      const res = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));
      setMyReservations(res);
    }, (err) => {
      // console.error('My Reservations snapshot error:', err);
    });

    return () => unsubscribe();
  }, [user]);

  // Listen to All My Reservations (History)
  useEffect(() => {
    if (!user) {
      setAllMyReservations([]);
      return;
    }
    // console.log('Setting up All My Reservations Snapshot...');

    const q = query(
      collection(db, 'reservations'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // console.log(`All My Reservations snapshot received: ${snapshot.size} documents`);
      const res = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));
      
      // Auto-cleanup for the specific ghost reservation requested by user (Proyector 1 at 17:23)
      res.forEach(r => {
        if (r.startTime && typeof r.startTime.toDate === 'function') {
          try {
            const date = r.startTime.toDate();
            const timeStr = format(date, 'HH:mm');
            if (timeStr === '17:23' && r.projectorId.includes('proj-1')) {
              // console.log('Auto-cleaning ghost reservation:', r.id);
              deleteDoc(doc(db, 'reservations', r.id));
            }
          } catch (e) {
            // Error checking ghost reservation
          }
        }
      });

      setAllMyReservations(res.sort((a, b) => {
        const timeA = a.startTime?.toMillis?.() || 0;
        const timeB = b.startTime?.toMillis?.() || 0;
        return timeB - timeA;
      }));
    }, (err) => {
      // console.error('All My Reservations snapshot error:', err);
    });

    return () => unsubscribe();
  }, [user]);

  const handleReserve = async (projector: Projector) => {
    if (!user || isReserving) return;
    // console.log(`Attempting to reserve projector: ${projector.id}`);
    setIsReserving(true);

    try {
      // 1. Create reservation document
      // console.log('Creating reservation document...');
      const resRef = await addDoc(collection(db, 'reservations'), {
        projectorId: projector.id,
        userId: user.uid,
        userName: user.displayName || user.email,
        startTime: serverTimestamp(),
        status: 'active'
      });
      // console.log(`Reservation created with ID: ${resRef.id}`);

      // 2. Update projector status
      // console.log('Updating projector status...');
      await updateDoc(doc(db, 'projectors', projector.id), {
        status: 'reserved',
        currentReservationId: resRef.id
      });
      // console.log('Projector status updated to reserved');

      // 3. Send immediate notification
      sendNotification(`Reserva Confirmada`, {
        body: `Has reservado el ${projector.name}. ¡Disfrútalo!`,
        tag: `res-${resRef.id}`
      });

      // 4. Schedule 1-hour reminder
      setTimeout(() => {
        sendNotification(`Recordatorio de Uso`, {
          body: `El ${projector.name} lleva 1 hora en uso.`,
          tag: `rem-${resRef.id}`,
          requireInteraction: true
        });
      }, 60 * 60 * 1000); // 1 hour

      addToast(`Reserva confirmada: ${projector.name}`, 'success');
      setConfirmingProjector(null);
    } catch (err) {
      // console.error('Reservation error:', err);
      addToast("No se pudo realizar la reserva.", "error");
    } finally {
      setIsReserving(false);
    }
  };

  const handleUpdateProjector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProjector) return;

    try {
      await updateDoc(doc(db, 'projectors', editingProjector.id), {
        name: editingProjector.name,
        model: editingProjector.model,
        serialNumber: editingProjector.serialNumber,
        status: editingProjector.status,
        location: editingProjector.location || '',
        roomId: editingProjector.roomId || '',
        resolution: editingProjector.resolution || '',
        bulbHours: Number(editingProjector.bulbHours) || 0
      });
      addToast('Proyector actualizado', 'success');
      setEditingProjector(null);
    } catch (err) {
      addToast("Error al actualizar", "error");
    }
  };

  const deleteReservation = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'reservations', id));
      addToast("Reserva eliminada permanentemente", "success");
    } catch (err) {
      addToast("No se pudo eliminar la reserva", "error");
    }
  };

  const toggleMaintenance = async (projector: Projector) => {
    try {
      const newStatus = projector.status === 'maintenance' ? 'available' : 'maintenance';
      await updateDoc(doc(db, 'projectors', projector.id), {
        status: newStatus
      });
      addToast(`Proyector ${newStatus === 'maintenance' ? 'en mantenimiento' : 'disponible'}`, 'success');
    } catch (err) {
      addToast("Error al cambiar estado", "error");
    }
  };

  const copyShareLink = () => {
    // Usamos el enlace -pre que es el público para compartir y evitar el error 403
    const shareUrl = "https://ais-pre-3ryuzy4ma6tpoimndvpncp-546116672769.us-east1.run.app";
    navigator.clipboard.writeText(shareUrl);
    addToast("Link público copiado. ¡Ya puedes enviarlo a tus colegas!", "success");
  };
  const handleRelease = async (projector: Projector) => {
    if (!user || !projector.currentReservationId) return;
    // console.log(`Attempting to release projector: ${projector.id}`);

    try {
      // 1. Update reservation status
      // console.log(`Updating reservation status to completed for ID: ${projector.currentReservationId}`);
      await updateDoc(doc(db, 'reservations', projector.currentReservationId), {
        status: 'completed',
        endTime: serverTimestamp()
      });
      // console.log('Reservation status updated');

      // 2. Update projector status
      // console.log('Updating projector status to available...');
      await updateDoc(doc(db, 'projectors', projector.id), {
        status: 'available',
        currentReservationId: null
      });
      // console.log('Projector status updated');
      addToast(`Proyector ${projector.name} liberado`, 'success');
    } catch (err) {
      // console.error('Release error:', err);
      addToast("No se pudo liberar el proyector.", "error");
    }
  };

  // Global Error Handler
  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      setError(`Error crítico: ${e.message || 'Error desconocido'}`);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Ha ocurrido un error</h2>
        <p className="text-slate-400 mb-6 max-w-md">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-8 py-3 bg-red-600 hover:bg-red-500 rounded-xl font-bold transition-colors"
        >
          Reiniciar aplicación
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white overflow-y-auto text-center">
        {!loadingTimeout ? (
          <>
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative mb-12"
            >
              {/* Projector Body */}
              <motion.div
                animate={{ 
                  y: [0, -10, 0],
                  scale: [1, 1.02, 1]
                }}
                transition={{ 
                  repeat: Infinity, 
                  duration: 3,
                  ease: "easeInOut" 
                }}
                className="relative z-10"
              >
                <div className="w-32 h-16 bg-emerald-500 rounded-2xl relative shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                  {/* Lens */}
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-slate-950 rounded-full flex items-center justify-center">
                    <div className="w-5 h-5 bg-emerald-400 rounded-full animate-pulse" />
                  </div>
                  {/* Details */}
                  <div className="absolute left-6 top-4 w-12 h-1.5 bg-emerald-900/40 rounded-full" />
                  <div className="absolute left-6 top-7 w-8 h-1.5 bg-emerald-900/40 rounded-full" />
                  <div className="absolute left-6 top-10 w-10 h-1.5 bg-emerald-900/40 rounded-full" />
                  {/* Feet */}
                  <div className="absolute -bottom-2 left-4 w-3 h-2 bg-emerald-600 rounded-sm" />
                  <div className="absolute -bottom-2 right-4 w-3 h-2 bg-emerald-600 rounded-sm" />
                </div>

                {/* Light Beam */}
                <motion.div 
                  animate={{ 
                    opacity: [0.2, 0.6, 0.2],
                    scaleX: [1, 1.1, 1]
                  }}
                  transition={{ 
                    repeat: Infinity, 
                    duration: 2,
                    ease: "easeInOut" 
                  }}
                  className="absolute left-full top-1/2 -translate-y-1/2 origin-left"
                  style={{
                    width: '120px',
                    height: '80px',
                    background: 'linear-gradient(90deg, rgba(16,185,129,0.4) 0%, transparent 100%)',
                    clipPath: 'polygon(0 40%, 100% 0, 100% 100%, 0 60%)'
                  }}
                />
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <h1 className="text-2xl font-bold tracking-tight mb-2">Reserva de Proyectores</h1>
              <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                <span>Sincronizando datos</span>
                <div className="flex gap-1">
                  <motion.div animate={{ scale: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <motion.div animate={{ scale: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <motion.div animate={{ scale: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                </div>
              </div>
            </motion.div>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            <AlertCircle className="w-16 h-16 text-amber-500 mx-auto" />
            <h2 className="text-xl font-bold">La carga está tardando más de lo normal</h2>
            <p className="text-slate-400 max-w-xs mx-auto">
              Esto puede deberse a una conexión lenta o a un problema con el caché del navegador.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-medium transition-colors"
              >
                Reintentar carga
              </button>
              <button 
                onClick={() => setLoading(false)}
                className="text-emerald-500 text-sm hover:underline"
              >
                Forzar entrada al sistema
              </button>
            </div>
          </motion.div>
        )}
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl p-12 text-center space-y-10 border border-white/20"
        >
          <div className="relative w-28 h-28 mx-auto">
            <div className="absolute inset-0 bg-indigo-600 blur-2xl opacity-20 animate-pulse"></div>
            <div className="relative bg-gradient-to-br from-indigo-500 to-violet-600 w-full h-full rounded-[2rem] flex items-center justify-center shadow-2xl rotate-3">
              <Monitor className="w-14 h-14 text-white" />
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-none">Proyectores Pro</h1>
            <p className="text-slate-500 dark:text-slate-400 text-lg font-medium">Gestión inteligente de recursos para tu equipo.</p>
          </div>
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black py-5 px-8 rounded-[2rem] transition-all shadow-2xl hover:scale-[1.02] active:scale-95 group"
          >
            <div className="bg-white/10 dark:bg-slate-900/10 p-2 rounded-xl group-hover:rotate-12 transition-transform">
              <LogIn className="w-6 h-6" />
            </div>
            Ingresar con Google
          </button>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] font-bold">Acceso Seguro con Firebase</p>
        </motion.div>
      </div>
    );
  }

  const filteredProjectors = projectors.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         p.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         p.model?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRoom = selectedRoom === 'all' || p.roomId === selectedRoom;
    return matchesSearch && matchesRoom;
  });

  const rooms = Array.from(new Set(projectors.map(p => p.roomId || ''))).filter(Boolean).sort((a, b) => {
    const numA = parseInt((a as string).replace(/\D/g, '')) || 0;
    const numB = parseInt((b as string).replace(/\D/g, '')) || 0;
    return numA - numB;
  });

  const renderHome = () => (
    <motion.section 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <Monitor className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Gestión de Salas de Cine
          </h2>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
              Capacidad Total
            </span>
            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
              {projectors.length} Equipos
            </span>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 relative group">
            <input
              type="text"
              placeholder="Buscar por modelo, sala o nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-3.5 pl-12 pr-4 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
            />
            <Monitor className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-500 transition-colors" />
          </div>
          
          <div className="relative">
            <select
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="w-full appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-3.5 pl-4 pr-10 text-sm font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm cursor-pointer"
            >
              <option key="all-rooms" value="all">Todas las Salas</option>
              {rooms.map((room, index) => (
                <option key={`room-option-${room || index}`} value={room}>{room || 'Sin Sala'}</option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <Monitor className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {projectors.length === 0 ? (
          Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 h-64 animate-pulse space-y-4">
              <div className="flex justify-between">
                <div className="space-y-2 w-2/3">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full"></div>
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/2"></div>
                </div>
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
              </div>
              <div className="space-y-2">
                <div className="h-2 bg-slate-50 dark:bg-slate-800 rounded w-full"></div>
                <div className="h-2 bg-slate-50 dark:bg-slate-800 rounded w-3/4"></div>
              </div>
              <div className="h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl w-full mt-auto"></div>
            </div>
          ))
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredProjectors.map((projector) => {
              const isReserved = projector.status === 'reserved';
              const isMyReservation = myReservations.some(r => r.projectorId === projector.id);

              return (
                <motion.div 
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={projector.id}
                  className={cn(
                    "bg-white dark:bg-slate-900 rounded-3xl p-5 border transition-all shadow-sm flex flex-col justify-between h-72 group",
                    isReserved 
                      ? "border-slate-100 dark:border-slate-800 opacity-90" 
                      : "border-indigo-50 dark:border-indigo-900/20 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-2xl hover:shadow-indigo-500/10"
                  )}
                >
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded uppercase">
                            {projector.roomId}
                          </span>
                          <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight">{projector.name}</h3>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">{projector.model}</p>
                      </div>
                      <div className={cn(
                        "p-3 rounded-2xl transition-colors",
                        projector.status === 'reserved' ? "bg-amber-50 dark:bg-amber-500/10" : 
                        projector.status === 'maintenance' ? "bg-red-50 dark:bg-red-500/10" :
                        "bg-indigo-50 dark:bg-indigo-500/10 group-hover:bg-indigo-600 group-hover:text-white"
                      )}>
                        <Monitor className={cn(
                          "w-5 h-5 transition-colors",
                          projector.status === 'reserved' ? "text-amber-500" : 
                          projector.status === 'maintenance' ? "text-red-500" :
                          "text-indigo-600 dark:text-indigo-400 group-hover:text-white"
                        )} />
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span className="text-slate-400 uppercase tracking-wider">Estado</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] uppercase tracking-tighter",
                          projector.status === 'available' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" :
                          projector.status === 'reserved' ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" :
                          "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                        )}>
                          {projector.status === 'available' ? 'Disponible' : 
                           projector.status === 'reserved' ? 'En Uso' : 'Mantenimiento'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span className="text-slate-400 uppercase tracking-wider">Resolución</span>
                        <span className="text-slate-700 dark:text-slate-300">{projector.resolution}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span className="text-slate-400 uppercase tracking-wider">Horas Lámpara</span>
                        <span className={cn(
                          projector.bulbHours > 1500 ? "text-amber-500" : "text-emerald-500"
                        )}>{projector.bulbHours}h</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(projector.bulbHours / 2000) * 100}%` }}
                          className={cn(
                            "h-full rounded-full",
                            projector.bulbHours > 1500 ? "bg-amber-500" : "bg-emerald-500"
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800">
                    {projector.status === 'maintenance' ? (
                      <div className="w-full bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-black py-3 rounded-2xl text-center text-[11px] uppercase tracking-widest flex items-center justify-center gap-2">
                        <XCircle className="w-4 h-4" />
                        Fuera de Servicio
                      </div>
                    ) : isReserved ? (
                      isMyReservation ? (
                        <button
                          onClick={() => handleRelease(projector)}
                          className="w-full bg-red-50 dark:bg-red-500/10 hover:bg-red-500 hover:text-white text-red-600 dark:text-red-400 font-black py-3 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95"
                        >
                          <Clock className="w-4 h-4" />
                          Liberar Equipo
                        </button>
                      ) : (
                        <div className="w-full bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 font-black py-3 rounded-2xl text-center text-[11px] uppercase tracking-widest">
                          Reservado
                        </div>
                      )
                    ) : (
                      <button
                        onClick={() => setConfirmingProjector(projector)}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-none active:scale-95"
                      >
                        <Calendar className="w-4 h-4" />
                        Reservar Ahora
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </motion.section>
  );

  const renderReservations = () => (
    <motion.section 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-8"
    >
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          Reservas Activas
        </h2>
        {myReservations.length > 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            {myReservations.map((res, idx) => {
              const projector = projectors.find(p => p.id === res.projectorId);
              return (
                <div 
                  key={res.id}
                  className={cn(
                    "p-6 flex items-center justify-between transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50",
                    idx !== myReservations.length - 1 && "border-b border-slate-100 dark:border-slate-800"
                  )}
                >
                  <div className="flex items-center gap-5">
                    <div className="bg-indigo-50 dark:bg-indigo-500/10 p-4 rounded-2xl">
                      <Monitor className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">{projector?.name || 'Proyector'}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Desde las {res.startTime?.toDate ? format(res.startTime.toDate(), 'HH:mm', { locale: es }) : '...'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => projector && handleRelease(projector)}
                    className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-red-100 dark:hover:bg-red-500/20 transition-all active:scale-95"
                  >
                    Finalizar
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-16 text-center space-y-6">
            <div className="bg-slate-50 dark:bg-slate-800 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
              <Calendar className="w-10 h-10 text-slate-300 dark:text-slate-600" />
            </div>
            <div className="space-y-2">
              <p className="text-slate-900 dark:text-white font-bold text-lg">Sin reservas activas</p>
              <p className="text-slate-500 dark:text-slate-400">¿Necesitas un proyector? Revisa la disponibilidad.</p>
            </div>
            <button 
              onClick={() => setActiveTab('home')}
              className="bg-indigo-600 text-white font-bold px-8 py-3 rounded-2xl shadow-lg shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 transition-all active:scale-95"
            >
              Explorar Proyectores
            </button>
          </div>
        )}
      </div>

      {/* History Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
          <Clock className="w-6 h-6 text-slate-400" />
          Historial Reciente
        </h2>
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          {allMyReservations.filter(r => r.status !== 'active').slice(0, 10).map((res, idx, arr) => {
            const projector = projectors.find(p => p.id === res.projectorId);
            return (
              <div 
                key={res.id}
                className={cn(
                  "p-5 flex items-center justify-between",
                  idx !== arr.length - 1 && "border-b border-slate-100 dark:border-slate-800"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-2xl">
                    <Monitor className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-700 dark:text-slate-200">{projector?.name || 'Proyector'}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {res.startTime?.toDate ? format(res.startTime.toDate(), 'dd MMM, HH:mm', { locale: es }) : '...'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "text-[10px] font-black uppercase px-3 py-1.5 rounded-lg tracking-wider",
                    res.status === 'completed' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"
                  )}>
                    {res.status === 'completed' ? 'Completado' : 'Cancelado'}
                  </div>
                  <button
                    onClick={() => deleteReservation(res.id)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
                    title="Eliminar del historial"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
          {allMyReservations.filter(r => r.status !== 'active').length === 0 && (
            <div className="p-12 text-center text-slate-400 dark:text-slate-600 text-sm italic">
              Tu historial aparecerá aquí una vez finalices una reserva.
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );

  const renderProfile = () => (
    <motion.section 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-6 shadow-sm">
        <div className="relative w-28 h-28 mx-auto">
          {user.photoURL ? (
            <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover rounded-3xl border-4 border-white dark:border-slate-800 shadow-2xl rotate-3" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full bg-indigo-100 dark:bg-indigo-500/20 rounded-3xl flex items-center justify-center border-4 border-white dark:border-slate-800 shadow-2xl">
              <User className="w-14 h-14 text-indigo-600 dark:text-indigo-400" />
            </div>
          )}
          <div className="absolute -bottom-2 -right-2 bg-emerald-500 w-6 h-6 rounded-full border-4 border-white dark:border-slate-900"></div>
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">{user.displayName}</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium">{user.email}</p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="flex items-center sm:flex-col gap-4 sm:gap-2 bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl transition-all active:scale-95"
          >
            <div className="bg-white dark:bg-slate-700 p-2 rounded-xl shadow-sm shrink-0">
              {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-indigo-600" />}
            </div>
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">Tema {darkMode ? 'Oscuro' : 'Claro'}</span>
          </button>
          <button
            onClick={() => signOut(auth)}
            className="flex items-center sm:flex-col gap-4 sm:gap-2 bg-red-50 dark:bg-red-500/10 p-4 rounded-2xl transition-all active:scale-95"
          >
            <div className="bg-white dark:bg-slate-700 p-2 rounded-xl shadow-sm shrink-0">
              <LogOut className="w-5 h-5 text-red-600" />
            </div>
            <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase">Salir</span>
          </button>
        </div>

        {/* Notificaciones */}
        {notificationPermission !== 'granted' && (
          <div className="bg-amber-50 dark:bg-amber-500/10 rounded-2xl p-6 border border-amber-100 dark:border-amber-900/30 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 dark:bg-amber-500/20 p-2 rounded-xl">
                <Bell className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-black text-amber-900 dark:text-amber-400 uppercase">Activar Notificaciones</h3>
                <p className="text-[10px] text-amber-700 dark:text-amber-500 font-medium">Recibe alertas de tus reservas y recordatorios de uso.</p>
              </div>
            </div>
            <button
              onClick={requestNotificationPermission}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-3 rounded-xl shadow-md active:scale-95 transition-all text-xs uppercase tracking-wider"
            >
              Permitir Notificaciones
            </button>
          </div>
        )}

        {/* Sección de Instalación Directa */}
        {!isInstalled && (
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white text-left space-y-4 relative overflow-hidden shadow-lg">
            <div className="absolute -right-6 -top-6 bg-white/10 w-24 h-24 rounded-full blur-2xl"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <Monitor className="w-6 h-6" />
                <h3 className="text-lg font-black">Instalar App Pro</h3>
              </div>
              
              {isInIframe ? (
                <div className="space-y-4">
                  <p className="text-indigo-100 text-xs font-medium leading-relaxed">
                    Estás en modo vista previa. Para instalar la app, debes abrirla en una pestaña nueva del navegador.
                  </p>
                  <a 
                    href={window.location.href} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full bg-white text-indigo-600 font-black py-3 rounded-xl shadow-md active:scale-95 transition-transform text-sm flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Abrir en Pestaña Nueva
                  </a>
                </div>
              ) : (
                <>
                  <p className="text-indigo-100 text-xs font-medium leading-relaxed mb-4">
                    Lleva la gestión de proyectores a tu bolsillo con acceso instantáneo desde tu pantalla de inicio.
                  </p>
                  
                  {swStatus === 'ready' ? (
                    <div className="space-y-3">
                      {(deferredPrompt || (window as any).deferredPrompt) ? (
                        <button
                          onClick={handleInstallClick}
                          className="w-full bg-white text-indigo-600 font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-transform text-base flex items-center justify-center gap-3"
                        >
                          <Settings className="w-6 h-6 animate-spin-slow" />
                          Instalar App (Engranajes)
                        </button>
                      ) : (
                        <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-center">
                          <p className="text-xs text-indigo-100/80 mb-3">
                            Para instalar, usa el menú de tu navegador y selecciona "Instalar" o "Añadir a pantalla de inicio".
                          </p>
                          <button
                            onClick={() => window.location.reload()}
                            className="text-[10px] font-bold text-white/40 hover:text-white transition-colors uppercase tracking-widest"
                          >
                            Recargar Página
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full bg-white/5 border border-white/10 text-white/60 py-4 rounded-2xl text-sm flex items-center justify-center gap-3">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                      Preparando instalación...
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {isInstalled && (
          <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl p-6 border border-emerald-100 dark:border-emerald-900/30 flex items-center gap-4">
            <div className="bg-emerald-500 p-3 rounded-xl shadow-lg shadow-emerald-200 dark:shadow-none">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm font-black text-emerald-800 dark:text-emerald-400 uppercase tracking-tight">App Instalada</p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-500/50 font-medium">Ya tienes la mejor experiencia</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 space-y-6 shadow-sm">
        <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-widest">Estadísticas de Uso</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total Reservas</p>
            <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{allMyReservations.length}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Activas</p>
            <p className="text-2xl font-black text-emerald-500">{myReservations.length}</p>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="bg-amber-50 dark:bg-amber-500/10 rounded-3xl border border-amber-200 dark:border-amber-800/30 p-8 space-y-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-amber-800 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Panel de Administración
            </h3>
            <span className="bg-amber-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase">Admin</span>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <p className="text-sm text-amber-700 dark:text-amber-500/70 font-medium">
              Como administrador, puedes gestionar el estado y detalles de todos los proyectores del sistema.
            </p>
            <div className="max-h-[32rem] overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {projectors.map(p => (
                <div key={p.id} className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-amber-100 dark:border-amber-900/30 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-2xl flex items-center justify-center",
                        p.status === 'available' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600" :
                        p.status === 'maintenance' ? "bg-red-50 dark:bg-red-500/10 text-red-600" :
                        "bg-amber-50 dark:bg-amber-500/10 text-amber-600"
                      )}>
                        <Monitor className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">{p.name}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">{p.roomId} • {p.location}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select 
                        value={p.status}
                        onChange={async (e) => {
                          const newStatus = e.target.value as any;
                          try {
                            await updateDoc(doc(db, 'projectors', p.id), { status: newStatus });
                            addToast(`Estado de ${p.name} cambiado a ${newStatus}`, 'success');
                          } catch (err) {
                            addToast("Error al cambiar estado", "error");
                          }
                        }}
                        className={cn(
                          "text-[10px] font-black uppercase px-2 py-1 rounded-lg border-none outline-none cursor-pointer transition-all",
                          p.status === 'available' ? "bg-emerald-100 text-emerald-700" :
                          p.status === 'maintenance' ? "bg-red-100 text-red-700" :
                          p.status === 'out-of-service' ? "bg-slate-200 text-slate-700" :
                          "bg-amber-100 text-amber-700"
                        )}
                      >
                        <option value="available">Disponible</option>
                        <option value="reserved">Reservado</option>
                        <option value="maintenance">Mantenimiento</option>
                        <option value="out-of-service">Fuera de Servicio</option>
                      </select>
                      <button 
                        onClick={() => setEditingProjector(p)}
                        className="p-2 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-200 transition-all active:scale-90"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Modelo</p>
                      <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate">{p.model || 'N/A'}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Serie</p>
                      <p className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 truncate">{p.serialNumber || 'N/A'}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Resolución</p>
                      <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{p.resolution || 'N/A'}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Horas Lámpara</p>
                      <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{p.bulbHours || 0}h</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 space-y-6 shadow-sm">
        <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-widest">Sistema</h3>
        <div className="space-y-4">
          {[
            { label: 'Versión', value: 'v5.0.0 Pro (Update 2026)', color: 'text-slate-900 dark:text-white' },
            { label: 'Estado PWA', value: 'Optimizado', color: 'text-emerald-600' },
            { label: 'Notificaciones', value: Notification.permission === 'granted' ? 'Activadas' : 'Desactivadas', color: Notification.permission === 'granted' ? 'text-emerald-600' : 'text-amber-600', action: requestNotificationPermission },
            { label: 'Compartir App', value: 'Copiar Link', color: 'text-indigo-600 dark:text-indigo-400', action: copyShareLink },
            { label: 'Manifest', value: '/manifest.json', color: 'text-indigo-600 dark:text-indigo-400', mono: true },
            { label: 'Worker', value: '/sw.js', color: 'text-indigo-600 dark:text-indigo-400', mono: true }
          ].map((item, i) => (
            <div key={i} className="flex justify-between items-center text-sm border-b border-slate-50 dark:border-slate-800 pb-3 last:border-0">
              <span className="text-slate-500 dark:text-slate-400 font-medium">{item.label}</span>
              {item.action ? (
                <button 
                  onClick={item.action}
                  className={cn("font-bold hover:underline", item.color)}
                >
                  {item.value}
                </button>
              ) : (
                <span className={cn("font-bold", item.color, item.mono && "font-mono text-[10px]")}>{item.value}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32 transition-colors duration-300 overflow-y-visible">
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "px-6 py-4 rounded-2xl shadow-2xl pointer-events-auto flex items-center gap-3 min-w-[280px] border",
                toast.type === 'success' 
                  ? "bg-white dark:bg-slate-900 border-emerald-100 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-400" 
                  : "bg-white dark:bg-slate-900 border-red-100 dark:border-red-900/30 text-red-700 dark:text-red-400"
              )}
            >
              {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              <p className="text-sm font-bold">{toast.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-1.5 sm:p-2 rounded-xl">
              <Settings className="w-5 h-5 sm:w-6 sm:h-6 text-white animate-spin-slow" />
            </div>
            <span className="font-black text-lg sm:text-2xl text-slate-900 dark:text-white tracking-tighter">PROYECTORES</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden border-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 hover:scale-110 transition-transform relative"
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="User" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : (
                <User className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 dark:text-indigo-400" />
              )}
            </button>
            <button 
              onClick={() => {
                window.location.reload();
              }}
              className="p-2 sm:p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform"
            >
              <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 sm:p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform"
            >
              {darkMode ? <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />}
            </button>

            <AnimatePresence>
              {showProfileMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowProfileMenu(false)} 
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-6 top-24 w-56 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50"
                  >
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 mb-2">
                      <p className="text-sm font-black text-slate-900 dark:text-white truncate">{user.displayName}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                    </div>
                    <button
                      onClick={() => {
                        setActiveTab('profile');
                        setShowProfileMenu(false);
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                    >
                      <User className="w-4 h-4" />
                      <span className="text-xs font-bold">Mi Perfil</span>
                    </button>
                    <button
                      onClick={() => {
                        signOut(auth);
                        setShowProfileMenu(false);
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="text-xs font-bold">Cerrar Sesión</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <AnimatePresence>
          {editingProjector && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setEditingProjector(null)}
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl border border-white/10 space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-widest">Editar Proyector</h3>
                  <button onClick={() => setEditingProjector(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <XCircle className="w-6 h-6 text-slate-400" />
                  </button>
                </div>
                
                <form onSubmit={handleUpdateProjector} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre</label>
                      <input 
                        type="text" 
                        value={editingProjector.name}
                        onChange={(e) => setEditingProjector({...editingProjector, name: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Modelo</label>
                      <input 
                        type="text" 
                        value={editingProjector.model}
                        onChange={(e) => setEditingProjector({...editingProjector, model: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sala</label>
                      <input 
                        type="text" 
                        value={editingProjector.roomId || ''}
                        onChange={(e) => setEditingProjector({...editingProjector, roomId: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                        placeholder="Ej: Sala A"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ubicación</label>
                      <input 
                        type="text" 
                        value={editingProjector.location || ''}
                        onChange={(e) => setEditingProjector({...editingProjector, location: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                        placeholder="Ej: Piso 2"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Resolución</label>
                      <input 
                        type="text" 
                        value={editingProjector.resolution || ''}
                        onChange={(e) => setEditingProjector({...editingProjector, resolution: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                        placeholder="Ej: 1080p"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Horas Lámpara</label>
                      <input 
                        type="number" 
                        value={editingProjector.bulbHours || 0}
                        onChange={(e) => setEditingProjector({...editingProjector, bulbHours: Number(e.target.value)})}
                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Número de Serie</label>
                    <input 
                      type="text" 
                      value={editingProjector.serialNumber}
                      onChange={(e) => setEditingProjector({...editingProjector, serialNumber: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado</label>
                    <select 
                      value={editingProjector.status}
                      onChange={(e) => setEditingProjector({...editingProjector, status: e.target.value as any})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    >
                      <option key="status-available" value="available">Disponible</option>
                      <option key="status-maintenance" value="maintenance">Mantenimiento</option>
                      <option key="status-out-of-service" value="out-of-service">Fuera de Servicio</option>
                      <option key="status-reserved" value="reserved">Reservado (Solo lectura)</option>
                    </select>
                  </div>
                  
                  <button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-none transition-all active:scale-95 mt-4"
                  >
                    Guardar Cambios
                  </button>
                </form>
              </motion.div>
            </div>
          )}

          {confirmingProjector && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setConfirmingProjector(null)}
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl border border-white/10 space-y-6"
              >
                <div className="bg-indigo-50 dark:bg-indigo-500/10 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto">
                  <Calendar className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white">Confirmar Reserva</h3>
                  <p className="text-slate-500 dark:text-slate-400 font-medium">
                    ¿Deseas reservar el <span className="text-indigo-600 dark:text-indigo-400 font-bold">{confirmingProjector.name}</span>?
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    disabled={isReserving}
                    onClick={() => handleReserve(confirmingProjector)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-none transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                  >
                    {isReserving ? (
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                      />
                    ) : 'Confirmar Reserva'}
                  </button>
                  <button
                    onClick={() => setConfirmingProjector(null)}
                    className="w-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold py-4 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {activeTab === 'home' && renderHome()}
            {activeTab === 'reservations' && renderReservations()}
            {activeTab === 'profile' && renderProfile()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-slate-800 px-8 py-4 z-40 shadow-2xl rounded-3xl">
        <div className="flex items-center justify-between">
          {[
            { id: 'home', icon: Monitor, label: 'Inicio' },
            { id: 'reservations', icon: Calendar, label: 'Reservas' },
            { id: 'profile', icon: User, label: 'Perfil' }
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex flex-col items-center gap-1.5 transition-all relative group",
                activeTab === tab.id ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-600"
              )}
            >
              <tab.icon className={cn("w-6 h-6 transition-transform group-active:scale-75", activeTab === tab.id && "scale-110")} />
              <span className="text-[10px] font-black uppercase tracking-tighter">{tab.label}</span>
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="nav-pill" 
                  className="absolute -bottom-1 w-8 h-1 bg-indigo-600 dark:bg-indigo-400 rounded-full" 
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default App;
