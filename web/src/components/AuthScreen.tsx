'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, AlertCircle, RefreshCw, Building2 } from 'lucide-react';

interface AuthScreenProps {
  onSuccess: () => void;
}

export default function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [cuit, setCuit] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [cuitLoading, setCuitLoading] = useState(false);
  const [cuitVerified, setCuitVerified] = useState(false);
  const [cuitError, setCuitError] = useState<string | null>(null);

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

  const lookupBcra = async (cleanDigits: string) => {
    try {
      setCuitLoading(true);
      setCuitError(null);

      const res = await fetch(`/api/cuit-lookup?cuit=${cleanDigits}`);
      const data = await res.json();

      if (data.ok && data.denominacion) {
        setEmpresa(data.denominacion);
        setCuitVerified(true);
        setCuitError(null);
      } else {
        setCuitVerified(false);
        setCuitError(
          data.error || 'No se encontró en Central de Deudores BCRA. Puedes ingresar el nombre de la empresa manualmente.'
        );
      }
    } catch (err) {
      console.warn('Error consultando BCRA:', err);
      setCuitVerified(false);
      setCuitError('No se pudo verificar con el BCRA. Por favor escribe la razón social manualmente.');
    } finally {
      setCuitLoading(false);
    }
  };

  const handleCuitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const clean = rawVal.replace(/\D/g, '');
    if (clean.length > 11) return;

    // Formateo visual XX-XXXXXXXX-X
    let formatted = clean;
    if (clean.length > 2 && clean.length <= 10) {
      formatted = `${clean.slice(0, 2)}-${clean.slice(2)}`;
    } else if (clean.length > 10) {
      formatted = `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;
    }

    setCuit(formatted);
    setCuitError(null);

    if (clean.length === 11) {
      lookupBcra(clean);
    } else {
      setCuitVerified(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email || !password) {
      setErrorMsg('Por favor completa el correo y la contraseña');
      return;
    }

    if (isRegister) {
      if (!nombre.trim() || !apellido.trim()) {
        setErrorMsg('Por favor ingresa tu nombre y apellido');
        return;
      }

      const cleanCuit = cuit.replace(/\D/g, '');
      if (cleanCuit.length !== 11) {
        setErrorMsg('El CUIT de la empresa debe tener 11 dígitos');
        return;
      }

      if (!empresa.trim()) {
        setErrorMsg('Por favor ingresa la razón social de la empresa');
        return;
      }
    }

    try {
      setLoading(true);

      if (isRegister) {
        const cleanCuit = cuit.replace(/\D/g, '');
        const fullName = `${nombre.trim()} ${apellido.trim()}`.trim();

        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              nombre: nombre.trim(),
              apellido: apellido.trim(),
              nombre_contacto: fullName,
              cuit: cleanCuit,
              empresa: empresa.trim(),
            },
          },
        });
        if (error) throw error;

        if (data.session) {
          onSuccess();
        } else {
          setSuccessMsg('¡Cuenta registrada con éxito! Si se requiere confirmación por email, revisa tu casilla.');
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
      } else if (msg.includes('Email not confirmed')) {
        msg = 'Debes confirmar tu correo electrónico antes de ingresar. Revisa tu casilla o spam.';
      } else if (msg.includes('Database error saving new user')) {
        msg = 'Error al registrar el perfil. Contacta al soporte técnico.';
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className={`auth-card ${isRegister ? 'auth-card-wide' : ''}`}>
        {/* Logo Oficial Selnet */}
        <div className="auth-header">
          <div className="auth-logo-badge">
            <img
              src="/logo-selnet-white.png"
              alt="Selnet Soluciones Integrales"
              className="auth-official-logo"
            />
          </div>
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
            Crear Cuenta Empresa
          </button>
        </div>

        {/* Mensajes de feedback */}
        {errorMsg && <div className="auth-alert error">{errorMsg}</div>}
        {successMsg && <div className="auth-alert success">{successMsg}</div>}

        {/* Formulario */}
        <form onSubmit={handleEmailAuth} className="auth-form">
          {/* Campos adicionales de Registro de Empresa */}
          {isRegister && (
            <>
              {/* Fila Nombre y Apellido */}
              <div className="auth-row-2col">
                <div className="auth-field">
                  <label>Nombre</label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Juan"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="auth-field">
                  <label>Apellido</label>
                  <input
                    type="text"
                    value={apellido}
                    onChange={(e) => setApellido(e.target.value)}
                    placeholder="Ej. Pérez"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              {/* CUIT con consulta automática al BCRA */}
              <div className="auth-field">
                <div className="auth-field-header">
                  <label>CUIT / CUIL de la Empresa</label>
                  {cuitLoading && (
                    <span className="cuit-badge-status loading">
                      <RefreshCw size={11} className="spin-anim" /> Consultando BCRA...
                    </span>
                  )}
                  {cuitVerified && (
                    <span className="cuit-badge-status verified">
                      <CheckCircle2 size={11} /> Verificado por BCRA
                    </span>
                  )}
                </div>
                <div className="auth-input-wrapper">
                  <input
                    type="text"
                    value={cuit}
                    onChange={handleCuitChange}
                    placeholder="30-XXXXXXXX-X (11 dígitos)"
                    required
                    maxLength={13}
                    disabled={loading}
                    className={cuitVerified ? 'input-success' : cuitError ? 'input-warn' : ''}
                  />
                </div>
                {cuitError && (
                  <p className="cuit-helper-msg warn">
                    <AlertCircle size={12} />
                    <span>{cuitError}</span>
                  </p>
                )}
              </div>

              {/* Razón Social autocompletada por BCRA */}
              <div className="auth-field">
                <div className="auth-field-header">
                  <label>Nombre de la Empresa / Razón Social</label>
                  {cuitVerified && (
                    <span className="cuit-badge-status auto-tag">
                      <Building2 size={11} /> Autocompletado oficial
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  placeholder="Se autocompleta con el CUIT o ingresa aquí"
                  required
                  disabled={loading}
                  className={cuitVerified ? 'input-highlight' : ''}
                />
              </div>
            </>
          )}

          {/* Correo Electrónico */}
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

          {/* Contraseña */}
          <div className="auth-field">
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              disabled={loading}
            />
          </div>

          <button type="submit" disabled={loading} className="btn-auth-submit">
            {loading
              ? 'Procesando...'
              : isRegister
              ? 'Registrar Empresa en Selnet'
              : 'Ingresar al Catálogo'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Selnet S.A. &copy; {new Date().getFullYear()} — Mayorista de Tecnología & Seguridad</p>
        </div>
      </div>
    </div>
  );
}
