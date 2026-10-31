'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface AuthScreenProps {
  onSuccess: () => void;
}

export default function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const supabase = createClient();

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}` : undefined,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      console.error('Error Google Auth:', err);
      setErrorMsg(err.message || 'Error al iniciar sesión con Google');
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Por favor completa todos los campos');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;

        if (data.session) {
          onSuccess();
        } else {
          setSuccessMsg('¡Cuenta creada con éxito! Si te solicitamos confirmar el email, revisa tu casilla.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
        onSuccess();
      }
    } catch (err: any) {
      console.error('Error Auth:', err);
      let msg = err.message || 'Error en la autenticación';
      if (msg.includes('Invalid login credentials')) {
        msg = 'Correo electrónico o contraseña incorrectos.';
      } else if (msg.includes('User already registered')) {
        msg = 'Ya existe una cuenta con este correo. Prueba iniciar sesión.';
      } else if (msg.includes('Password should be at least 6 characters')) {
        msg = 'La contraseña debe tener al menos 6 caracteres.';
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* Logo Corporativo Selnet */}
        <div className="auth-header">
          <div className="auth-logo-badge">
            <svg width="40" height="40" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="50" fill="var(--selnet-red)" />
              <path
                d="M 50,15 A 35,35 0 0,1 85,50 A 17.5,17.5 0 0,1 67.5,67.5 A 17.5,17.5 0 0,1 50,50 A 17.5,17.5 0 0,0 32.5,32.5 A 17.5,17.5 0 0,0 15,50 A 35,35 0 0,1 50,15 Z"
                fill="#ffffff"
              />
            </svg>
          </div>
          <h1 className="auth-title">SELNET</h1>
          <p className="auth-subtitle">Portal Mayorista y Lista de Precios Oficial</p>
        </div>

        {/* Botón Google OAuth */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="btn-google-auth"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continuar con Google</span>
        </button>

        <div className="auth-divider">
          <span>o ingresa con tu correo</span>
        </div>

        {/* Selector Iniciar Sesión / Registro */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${!isRegister ? 'active' : ''}`}
            onClick={() => {
              setIsRegister(false);
              setErrorMsg(null);
            }}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            className={`auth-tab ${isRegister ? 'active' : ''}`}
            onClick={() => {
              setIsRegister(true);
              setErrorMsg(null);
            }}
          >
            Crear Cuenta
          </button>
        </div>

        {/* Mensajes de feedback */}
        {errorMsg && <div className="auth-alert error">{errorMsg}</div>}
        {successMsg && <div className="auth-alert success">{successMsg}</div>}

        {/* Formulario */}
        <form onSubmit={handleEmailAuth} className="auth-form">
          <div className="auth-field">
            <label>Correo Electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu.correo@empresa.com"
              required
              disabled={loading}
            />
          </div>

          <div className="auth-field">
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>

          <button type="submit" disabled={loading} className="btn-auth-submit">
            {loading ? 'Procesando...' : isRegister ? 'Registrarme en Selnet' : 'Ingresar al Catálogo'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Selnet S.A. &copy; {new Date().getFullYear()} — Mayorista de Tecnología & Seguridad</p>
        </div>
      </div>
    </div>
  );
}
