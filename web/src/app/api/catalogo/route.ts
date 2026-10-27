import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Producto, UserTier } from '@/types';

// Mock data para testing/desarrollo cuando aún no se conectan las credenciales reales
const MOCK_CATALOGO: Producto[] = [
  {
    id: 1,
    sap: '300501234',
    cod_bejerman: 'DS2CD1023G0E',
    modelo: 'DS-2CD1023G0E-I',
    descripcion: 'Cámara IP Tubular 2MP 2.8mm IR30m IP67 H.265+ PoE',
    marca: 'HIKVISION',
    categoria: 'CAMARAS IP',
    subcategoria: 'SERIE 1000',
    precio_principal: 28.5,
    label_precio_principal: 'Gold gremio',
    precio_diamond: 23.8,
    precio_black: 25.2,
    precio_platinum: 26.9,
    precio_ruby: 27.5,
    precio_gold: 28.5,
    pvp: 38.0,
    epp: 32.5,
    iva: 0.105,
    stock: 154,
    en_transito: true,
    es_oferta: 'gold',
    oferta_txt: 'Promo especial gremio 10% OFF',
    es_nuevo: false,
    es_interno: false,
  },
  {
    id: 2,
    sap: '300505678',
    cod_bejerman: 'DS2CD2043G2I',
    modelo: 'DS-2CD2043G2-I',
    descripcion: 'Cámara IP Tubular 4MP AcuSense WDR 120dB IR40m H.265+',
    marca: 'HIKVISION',
    categoria: 'CAMARAS IP',
    subcategoria: 'ACUSENSE SERIE 2',
    precio_principal: 64.0,
    label_precio_principal: 'Gold gremio',
    precio_diamond: 52.0,
    precio_black: 55.0,
    precio_platinum: 59.0,
    precio_ruby: 61.5,
    precio_gold: 64.0,
    pvp: 85.0,
    epp: 72.0,
    iva: 0.105,
    stock: 42,
    en_transito: false,
    es_oferta: undefined,
    es_nuevo: true,
    es_interno: false,
  },
  {
    id: 3,
    sap: 'CS-C6N-R101-1G2WF',
    cod_bejerman: 'EZVIZC6N2MP',
    modelo: 'C6N 2MP',
    descripcion: 'Cámara Wi-Fi Interior Motorizada Pan/Tilt 1080p Visión Nocturna Inteligente Audio Bidireccional',
    marca: 'EZVIZ',
    categoria: 'SMARTHOME',
    subcategoria: 'INTERIOR',
    precio_principal: 21.0,
    label_precio_principal: 'Gold gremio',
    precio_diamond: 17.5,
    precio_black: 18.5,
    precio_platinum: 19.8,
    precio_ruby: 20.2,
    precio_gold: 21.0,
    pvp: 29.9,
    epp: 24.5,
    iva: 0.21,
    stock: 310,
    en_transito: true,
    es_oferta: 'gold,pvp',
    es_nuevo: false,
    es_interno: false,
  },
  {
    id: 4,
    sap: 'ST4000VX016',
    cod_bejerman: 'SKYHAWK4TB',
    modelo: 'ST4000VX016',
    descripcion: 'Disco Rígido Seagate SkyHawk 4TB Surveillance 24/7 SATA 6Gb/s 256MB Cache',
    marca: 'SEAGATE',
    categoria: 'ALMACENAMIENTO',
    subcategoria: 'DISCOS RIGIDOS',
    precio_principal: 98.0,
    label_precio_principal: 'Gold gremio',
    precio_diamond: 89.0,
    precio_black: 92.0,
    precio_platinum: 94.5,
    precio_ruby: 96.0,
    precio_gold: 98.0,
    pvp: 125.0,
    iva: 0.105,
    stock: 85,
    en_transito: false,
    es_oferta: undefined,
    es_nuevo: false,
    es_interno: false,
  },
  {
    id: 5,
    modelo: 'DGF-EN-001',
    descripcion: 'Licencia Digifort Enterprise Base V7 con soporte para 8 cámaras',
    marca: 'DIGIFORT',
    categoria: 'SOFTWARE VMS',
    subcategoria: 'ENTERPRISE',
    precio_principal: 420.0,
    label_precio_principal: 'Gold gremio',
    precio_diamond: 360.0,
    precio_black: 380.0,
    precio_platinum: 395.0,
    precio_ruby: 410.0,
    precio_gold: 420.0,
    pvp: 550.0,
    iva: 0.21,
    stock: 999,
    en_transito: false,
    es_oferta: undefined,
    es_nuevo: false,
    es_interno: false,
  },
  {
    id: 6,
    modelo: 'PB-60TK',
    descripcion: 'Barrera Infrarroja Fotoeléctrica Doble Haz 60 metros Exterior Takex',
    marca: 'TAKEX',
    categoria: 'PERIMETRAL',
    subcategoria: 'BARRERAS',
    precio_principal: 115.0,
    label_precio_principal: 'Gold gremio',
    precio_diamond: 98.0,
    precio_black: 102.0,
    precio_platinum: 107.0,
    precio_ruby: 110.0,
    precio_gold: 115.0,
    pvp: 149.0,
    iva: 0.105,
    stock: 18,
    en_transito: true,
    es_oferta: undefined,
    es_nuevo: false,
    es_interno: false,
  },
  {
    id: 7,
    modelo: 'FC410MDM',
    descripcion: 'Módulo de entrada y salida direccionable FireClass / Bentel',
    marca: 'BENTEL - FIRECLASS',
    categoria: 'INCENDIO',
    subcategoria: 'DIRECCIONABLE',
    precio_principal: 75.0,
    label_precio_principal: 'Gold gremio',
    precio_gold: 75.0,
    pvp: 99.0,
    iva: 0.105,
    stock: 35,
    en_transito: false,
    es_oferta: undefined,
    es_nuevo: false,
    es_interno: true, // EXCLUSIVO INTERNO
  },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const marca = searchParams.get('marca');
  const categoria = searchParams.get('categoria');
  const subcategoria = searchParams.get('subcategoria');
  const search = searchParams.get('search');
  const soloNuevos = searchParams.get('solo_nuevos') === 'true';

  try {
    const supabase = await createServerSupabaseClient();
    
    // Obtener sesión
    const { data: { user } } = await supabase.auth.getUser();

    let userTier: UserTier = 'gold';
    let userEmail = 'invitado@selnet.com.ar';

    if (user) {
      userEmail = user.email || userEmail;
      // Obtener perfil
      const { data: profile } = await supabase
        .from('profiles')
        .select('tier, activo')
        .eq('id', user.id)
        .single();

      if (profile && profile.activo) {
        userTier = profile.tier as UserTier;
      }
    }

    // Llamar a la función RPC de Supabase 'get_catalogo'
    const { data: dbData, error } = await supabase.rpc('get_catalogo', {
      p_marca: marca || null,
      p_categoria: categoria || null,
      p_subcategoria: subcategoria || null,
      p_solo_nuevos: soloNuevos,
      p_search: search || null,
    });

    if (!error && dbData && dbData.length > 0) {
      return NextResponse.json({
        ok: true,
        tier: userTier,
        email: userEmail,
        count: dbData.length,
        data: dbData,
      });
    }

    // Fallback a MOCK si la base aún no tiene datos o no se configuraron credenciales
    let filtered = [...MOCK_CATALOGO];

    // Filtro de marcas internas
    if (userTier !== 'interna') {
      filtered = filtered.filter(p => !p.es_interno);
    }

    if (marca) {
      filtered = filtered.filter(p => p.marca.toLowerCase() === marca.toLowerCase());
    }
    if (categoria) {
      filtered = filtered.filter(p => p.categoria?.toLowerCase() === categoria.toLowerCase());
    }
    if (subcategoria) {
      filtered = filtered.filter(p => p.subcategoria?.toLowerCase() === subcategoria.toLowerCase());
    }
    if (soloNuevos) {
      filtered = filtered.filter(p => p.es_nuevo);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.modelo.toLowerCase().includes(q) ||
        p.descripcion?.toLowerCase().includes(q) ||
        p.marca.toLowerCase().includes(q) ||
        p.sap?.toLowerCase().includes(q)
      );
    }

    // Mapeo seguro de precios según el tier
    const safeData = filtered.map(p => {
      let precioPrincipal = p.precio_gold;
      let labelPrincipal = 'Gold gremio';

      if (userTier === 'diamond') {
        precioPrincipal = p.precio_diamond;
        labelPrincipal = 'Diamond';
      } else if (userTier === 'black') {
        precioPrincipal = p.precio_black;
        labelPrincipal = 'Black';
      } else if (userTier === 'platinum') {
        precioPrincipal = p.precio_platinum;
        labelPrincipal = 'Platinum';
      } else if (userTier === 'ruby') {
        precioPrincipal = p.precio_ruby;
        labelPrincipal = 'Ruby';
      }

      return {
        ...p,
        precio_principal: precioPrincipal,
        label_precio_principal: labelPrincipal,
        // Limpiar campos no autorizados
        precio_diamond: userTier === 'diamond' || userTier === 'interna' ? p.precio_diamond : undefined,
        precio_black: ['diamond', 'black', 'interna'].includes(userTier) ? p.precio_black : undefined,
        precio_platinum: ['platinum', 'interna'].includes(userTier) ? p.precio_platinum : undefined,
        precio_ruby: ['diamond', 'black', 'ruby', 'interna'].includes(userTier) ? p.precio_ruby : undefined,
        epp: userTier !== 'gold' ? p.epp : undefined,
        cod_bejerman: userTier === 'interna' ? p.cod_bejerman : undefined,
        oferta_txt: userTier === 'interna' ? p.oferta_txt : undefined,
      };
    });

    return NextResponse.json({
      ok: true,
      tier: userTier,
      email: userEmail,
      count: safeData.length,
      data: safeData,
      is_mock: true,
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
