# Selnet | Plataforma Unificada de Listas de Precios

Plataforma SaaS moderna y de alto rendimiento para la consulta de catálogo, listas de precios segmentadas por niveles (Tiers) y disponibilidad de stock en tiempo real para **Selnet**.

Construida con la arquitectura: **Google Cloud BigQuery (OLAP) $\rightarrow$ Supabase / PostgreSQL (OLTP) $\rightarrow$ Next.js en Vercel (Edge Frontend)**.

---

## 📁 Estructura del Repositorio

```text
lista_precios_selnet/
├── database/
│   ├── bigquery/
│   │   └── v_catalogo_maestro.sql      # Vista canónica SQL que unifica las 14 marcas y calcula precios
│   └── supabase/
│       ├── 01_schema.sql               # DDL de perfiles, productos, logs e índices Full-Text
│       └── 02_security_and_views.sql   # Políticas RLS y función RPC segura get_catalogo()
├── backend_sync/                       # Servicio Serverless de sincronización BQ -> Supabase
│   ├── main.py                         # Script Python con handlers para CLI, HTTP y Pub/Sub
│   ├── requirements.txt
│   └── .env.example
├── web/                                # Frontend Next.js con TypeScript y diseño moderno
│   ├── src/
│   │   ├── app/                        # Next.js App Router (Páginas, Layout y API Routes)
│   │   ├── components/                 # Header, Sidebar, FiltersBar, ProductTable
│   │   ├── lib/supabase/               # Clientes Supabase para Browser y Servidor
│   │   └── types/                      # Definiciones de TypeScript
│   └── package.json
└── proyecto_antiguo/                   # Código heredado de Google Apps Script (Referencia)
```

---

## 🚀 Guía de Puesta en Marcha

### 1. BigQuery (GCP)
1. Abrir la consola de **BigQuery** en el proyecto `selnet-476815`.
2. Ejecutar el script [`database/bigquery/v_catalogo_maestro.sql`](./database/bigquery/v_catalogo_maestro.sql).
3. Se creará la vista `selnet-476815.pagina.v_catalogo_maestro`, reemplazando todas las tablas intermedias viejas `gold_*`.

### 2. Supabase (Base de Datos & Auth)
1. Ir al **SQL Editor** en el Dashboard de tu proyecto Supabase.
2. Ejecutar en orden:
   * [`database/supabase/01_schema.sql`](./database/supabase/01_schema.sql)
   * [`database/supabase/02_security_and_views.sql`](./database/supabase/02_security_and_views.sql)
3. Las tablas `profiles`, `productos` y la función segura `get_catalogo()` quedarán listas.

### 3. Sincronización Automática (Backend Sync)
1. Copiar `backend_sync/.env.example` a `backend_sync/.env` y completar las claves:
   ```env
   GCP_PROJECT_ID=selnet-476815
   SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJh...
   ```
2. Instalar dependencias y probar una sincronización inicial:
   ```bash
   cd backend_sync
   pip install -r requirements.txt
   python main.py
   ```
3. Para despliegue serverless en Google Cloud Functions:
   * Desplegar `main.py` con punto de entrada `sync_http_handler` o `sync_pubsub_handler` conectado a Eventarc.

### 4. Frontend Web (Vercel)
1. Ingresar a `web/` y configurar las variables de entorno en `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
   ```
2. Iniciar en desarrollo:
   ```bash
   cd web
   npm run dev
   ```
3. Desplegar en **Vercel**:
   * Conectar el repositorio de GitHub en Vercel.
   * Root Directory: `web`.
   * Agregar las variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## 🔒 Matriz de Seguridad y Visibilidad por Nivel

| Nivel de Usuario | Precios que puede ver | Acceso a Marcas de Alarma / Incendio (Bentel, DSC) |
| :--- | :--- | :---: |
| **Gold** | Gold Gremio, PVP, IVA | ❌ No |
| **Ruby** | Ruby, Gold Gremio, PVP, EPP, IVA | ❌ No |
| **Platinum** | Platinum, Gold Gremio, PVP, EPP, IVA | ❌ No |
| **Black** | Black, Ruby, Gold Gremio, PVP, EPP, IVA | ❌ No |
| **Diamond** | Diamond, Black, Ruby, Gold Gremio, PVP, EPP, IVA | ❌ No |
| **Interna** | **TODOS los precios**, Cód Bejerman y Detalle de Oferta | ✅ **Sí** |
