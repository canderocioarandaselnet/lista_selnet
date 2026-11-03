import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function validateCuit(cuit: string): boolean {
  const clean = cuit.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i], 10) * mult[i];
  }
  const mod = 11 - (sum % 11);
  const verif = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return verif === parseInt(clean[10], 10);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawCuit = searchParams.get('cuit') || '';
    const cleanCuit = rawCuit.replace(/\D/g, '');

    if (!cleanCuit || cleanCuit.length !== 11) {
      return NextResponse.json(
        { ok: false, error: 'El CUIT/CUIL debe contener 11 dígitos numéricos.' },
        { status: 400 }
      );
    }

    if (!validateCuit(cleanCuit)) {
      return NextResponse.json(
        { ok: false, error: 'El CUIT ingresado no es válido (dígito verificador incorrecto).' },
        { status: 400 }
      );
    }

    // Consultar endpoints de Central de Deudores del BCRA
    const endpoints = [
      `https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/${cleanCuit}`,
      `https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/Historicas/${cleanCuit}`,
      `https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/ChequesRechazados/${cleanCuit}`,
    ];

    let denominacion: string | null = null;

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'SelnetPortal/1.0',
          },
          // Cache por 1 hora si es exitoso
          next: { revalidate: 3600 },
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.results?.denominacion) {
            denominacion = data.results.denominacion.trim();
            break;
          }
        }
      } catch (err) {
        console.warn(`Error consultando BCRA en ${url}:`, err);
      }
    }

    if (denominacion) {
      return NextResponse.json({
        ok: true,
        cuit: cleanCuit,
        denominacion,
        fuente: 'BCRA Central de Deudores',
      });
    }

    return NextResponse.json({
      ok: false,
      cuit: cleanCuit,
      error: 'No se encontraron registros en Central de Deudores del BCRA. Puedes ingresar el nombre de la empresa manualmente.',
    });
  } catch (err: any) {
    console.error('Error general en cuit-lookup:', err);
    return NextResponse.json(
      { ok: false, error: 'Error de conexión con el servicio del BCRA.' },
      { status: 500 }
    );
  }
}
