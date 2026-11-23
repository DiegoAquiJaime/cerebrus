#!/usr/bin/env python3
"""Carga la semana SAC 23–29 nov 2026 con las líneas con monto de la hoja manuscrita.

Solo escribe sacCargas y vsData (estimados) de R|2026-11-23|2026-11-29 y fija el período.
No modifica la semana 16–22 ni otras semanas, cierres, créditos, facturas, propinas ni informes.
No envía pInv. No inventa montos ni carga conceptos en blanco.
"""
import copy
import json
import time
from pathlib import Path
from urllib.request import Request, build_opener, HTTPHandler, HTTPSHandler

API = 'https://script.google.com/macros/s/AKfycbzuICFPRwtELyBL4oOmcQXfc_JuFpulUF0MhaeCDrEw2q1IwnmyxkeCe40AtnleVNkZgQ/exec'
OUT = Path(__file__).resolve().parent
NEW_KEY = 'R|2026-11-23|2026-11-29'
OLD_KEY = 'R|2026-11-16|2026-11-22'
PERIOD = {'type': 'range', 'start': '2026-11-23', 'end': '2026-11-29'}

# Lun–Jue 2M, Vie 4M, Sáb 7M, Dom 6M
VS_EST = [2000000, 2000000, 2000000, 2000000, 4000000, 7000000, 6000000]
EXPECTED_VS_TOTAL = 25000000

P_FAC = ['facturas']
P_SEM = [
    'sacCargas', 'sacBorrados', 'sacIngresos', 'sacCierresHistorial', 'sacPeriodoTrabajo',
    'sacSemanaTrabajo', 'sacFinanciamientoRegistro', 'sacEfectivo', 'sacCajaChica',
    'sacCajaChicaNota', 'sacReservaSaldo', 'sacReservaMovs', 'sacMerc',
    'pagosSemanales', 'vsData', 'vsExtraData', 'facSemana', 'facSemHoySel',
    'facSemHoyMeta', 'facSemHistorialPagos', 'mercaderiaSemanasSimple',
]
P_MISC = ['propinas', 'informesDiarios', 'sebasFinanzas', 'creditos']
P_INV = [
    'inventario', 'preciosProveedor', 'semanaActiva', 'semanasHistorial',
    'catInventario', 'unidadesInventario', 'movimientos', 'movimientosAudit',
    'movimientosArchivo', 'invFamilias', 'invBodegaN3Applied',
    'inventorySnapshotId', 'inventorySnapshotDate', 'inventorySnapshotSource',
]
PART_KEYS = set(P_FAC + P_SEM + P_MISC + P_INV)

# Solo líneas con monto en «cargas semana 23 al 29 de noviembre.pdf».
CARGAS = [
    ('Turnos y Dobles', 'RRHH', 1200000),
    ('Bono Locomoción', 'RRHH', 250000),
    ('Bono Basura', 'Bono', 21000),
    ('Bono Comedor', 'RRHH', 120000),
    ('Bono Marcelo', 'RRHH', 100000),
    ('Abastible', 'Servicio', 665743),
    ('Chilquinta (Luz / Abono)', 'Servicio', 400000),
    ('Movistar', 'Servicio', 279028),
    ('Mantención', 'Servicio', 600000),
    ('Pacto Proveedores', 'Proveedor', 2200000),
    ('Supermercado', 'Proveedor', 7500000),
    ('Ariztía', 'Proveedor', 130000),
    ('Brotes', 'Proveedor', 46000),
    ('Flores Comestibles', 'Proveedor', 43000),
    ('Masas', 'Proveedor', 80000),
    ('Crédito Informal Alberto', 'Crédito', 3750000),
    ('Crédito Informal Matías/Pancho', 'Crédito', 3000000),
    ('Crédito Informal Sebastián', 'Crédito', 7750000),
    ('Cuota Matías', 'Crédito', 750000),
    ('Crédito Fogape', 'Crédito', 3230809),
    ('Tarjetas y Créditos', 'TC', 3000000),
    ('Retiro Personal Sebastián', 'Retiro', 2000000),
    ('Sra. Paty – Retiro Personal', 'Retiro', 250000),
    ('Pacto Sharif', 'Otro', 500000),
    ('Pago cuota CCMM', 'Otro', 1600000),
    ('Pago cuota CARNES 18 sept.', 'Otro', 100000),
]
EXPECTED_N = 26
EXPECTED_TOTAL = 39565580


class NoRedirect(HTTPHandler):
    def http_response(self, req, resp):
        return resp
    https_response = http_response


def opener():
    return build_opener(NoRedirect, HTTPSHandler)


def fetch_json(method, url, data=None, tries=5):
    last = None
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8') if data is not None else None
    for _ in range(tries):
        headers = {'Cache-Control': 'no-cache'}
        if body is not None:
            headers['Content-Type'] = 'application/json'
        req = Request(url, data=body, headers=headers, method=method)
        try:
            resp = opener().open(req, timeout=300)
            loc = resp.headers.get('Location')
            if loc and resp.status in (301, 302, 303, 307, 308):
                req2 = Request(loc, data=body, headers=headers, method=method)
                resp = opener().open(req2, timeout=300)
            raw = resp.read()
            text = raw.decode('utf-8', errors='replace')
            if not text.lstrip().startswith('{'):
                last = f'non-json {resp.status} {text[:120]!r}'
                continue
            return json.loads(text)
        except Exception as e:
            last = str(e)
    raise SystemExit(f'{method} falló: {last}')


def dump(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(',', ':'))


def split_parts(st, nid):
    stripped = copy.deepcopy(st)
    parts = {}
    for part_id, keys in (('pFac', P_FAC), ('pSem', P_SEM), ('pMisc', P_MISC)):
        obj = {}
        for k in keys:
            if k in stripped:
                obj[k] = stripped[k]
                del stripped[k]
        parts[part_id] = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    for k in list(PART_KEYS):
        stripped.pop(k, None)
    stripped['_partitioned'] = True
    stripped['_partitionV'] = 1
    stripped['_partitionIds'] = ['pInv', 'pFac', 'pSem', 'pMisc']
    parts['main'] = json.dumps({'state': stripped, 'nid': nid}, ensure_ascii=False, separators=(',', ':'))
    if 'pInv' in parts:
        raise SystemExit('NO se debe enviar pInv')
    return parts


def other_keys_blob(st, skip):
    out = {}
    for store in ('sacCargas', 'sacIngresos', 'vsData', 'vsExtraData'):
        bag = st.get(store) or {}
        if not isinstance(bag, dict):
            out[store] = bag
            continue
        out[store] = {k: bag[k] for k in bag if k != skip}
    return out


def build_cargas(now_ms):
    rows = []
    for i, (nombre, cat, monto) in enumerate(CARGAS):
        rows.append({
            'id': f'sc_{now_ms}_{i:02d}',
            'nombre': nombre,
            'cat': cat,
            'monto': monto,
            'montoReal': None,
            'estado': 'nopagado',
            'resp': '',
            'nota': '',
            '_updatedAt': now_ms,
        })
    return rows


def build_vs():
    return [
        {'est': e, 'real': 0, 'caja': 0, 'cerrado': False}
        for e in VS_EST
    ]


def vs_est_list(days):
    out = []
    for d in days or []:
        if not isinstance(d, dict):
            out.append(0)
            continue
        out.append(int(d.get('est') or d.get('e') or 0))
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if len(CARGAS) != EXPECTED_N:
        raise SystemExit('cantidad de líneas no cuadra')
    if sum(m for _, _, m in CARGAS) != EXPECTED_TOTAL:
        raise SystemExit(f'total de la hoja no cuadra: {sum(m for _, _, m in CARGAS)}')
    if sum(VS_EST) != EXPECTED_VS_TOTAL:
        raise SystemExit('total proyección no cuadra')

    print('1) Leyendo nube…')
    cloud = fetch_json('GET', API + '?action=getState&merge=1')
    if not cloud.get('ok'):
        raise SystemExit(cloud)
    st = cloud['data']['state']
    nid = cloud['data'].get('nid')
    (OUT / '00-cloud-before.json').write_text(json.dumps(cloud, ensure_ascii=False), encoding='utf-8')

    existing_new = (st.get('sacCargas') or {}).get(NEW_KEY) or []
    if existing_new:
        raise SystemExit(f'la semana nueva ya tiene {len(existing_new)} cargas; no la piso')

    old_before = dump((st.get('sacCargas') or {}).get(OLD_KEY))
    other_before = dump(other_keys_blob(st, NEW_KEY))
    extra_before = dump((st.get('vsExtraData') or {}).get(NEW_KEY))
    cierres_before = dump(st.get('sacCierresHistorial'))
    cred_before = dump(st.get('creditos'))
    fac_before = dump(st.get('facturas'))
    prop_before = dump(st.get('propinas'))
    inf_before = dump(st.get('informesDiarios'))
    inv_before = dump({k: st.get(k) for k in P_INV})
    period_before = st.get('sacPeriodoTrabajo')

    work = copy.deepcopy(st)
    now_ms = int(time.time() * 1000)
    rows = build_cargas(now_ms)
    if not isinstance(work.get('sacCargas'), dict):
        work['sacCargas'] = {}
    work['sacCargas'][NEW_KEY] = rows
    if not isinstance(work.get('vsData'), dict):
        work['vsData'] = {}
    work['vsData'][NEW_KEY] = build_vs()
    if not isinstance(work.get('sacIngresos'), dict):
        work['sacIngresos'] = {}
    if NEW_KEY not in work['sacIngresos']:
        work['sacIngresos'][NEW_KEY] = []

    work['sacPeriodoTrabajo'] = PERIOD
    if 'sacSemanaTrabajo' in work:
        del work['sacSemanaTrabajo']

    if dump((work.get('sacCargas') or {}).get(OLD_KEY)) != old_before:
        raise SystemExit('ABORT: se iba a tocar la semana 16–22')
    if dump(other_keys_blob(work, NEW_KEY)) != other_before:
        raise SystemExit('ABORT: se iban a tocar otras semanas')
    if dump((work.get('vsExtraData') or {}).get(NEW_KEY)) != extra_before:
        raise SystemExit('ABORT: se iba a tocar el extra de ventas de esta semana')
    if dump(work.get('sacCierresHistorial')) != cierres_before:
        raise SystemExit('ABORT: se iba a cerrar o tocar un cierre')
    if dump(work.get('creditos')) != cred_before:
        raise SystemExit('ABORT: créditos')
    if dump(work.get('facturas')) != fac_before:
        raise SystemExit('ABORT: facturas')
    if dump(work.get('propinas')) != prop_before or dump(work.get('informesDiarios')) != inf_before:
        raise SystemExit('ABORT: propinas o informes')
    if dump({k: work.get(k) for k in P_INV}) != inv_before:
        raise SystemExit('ABORT: inventario')

    preview = {
        'period_before': period_before,
        'new_key': NEW_KEY,
        'n': len(rows),
        'total': sum(c['monto'] for c in rows),
        'vs_est': VS_EST,
        'vs_total': sum(VS_EST),
        'cargas': [{'nombre': c['nombre'], 'cat': c['cat'], 'monto': c['monto']} for c in rows],
    }
    (OUT / '01-payload-preview.json').write_text(json.dumps(preview, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: preview[k] for k in ('period_before', 'new_key', 'n', 'total', 'vs_est', 'vs_total')}, ensure_ascii=False, indent=2))

    parts = split_parts(work, nid)
    print('part sizes', {k: len(v) for k, v in parts.items()})
    if 'pInv' in parts:
        raise SystemExit('ABORT pInv')

    print('2) Guardando…')
    result = fetch_json('POST', API, {
        'action': 'saveParted',
        'user': 'Diego',
        'description': 'Abre semana SAC 23–29 nov 2026 con hoja manuscrita + proyección ventas. No toca 16–22.',
        'parts': parts,
    })
    (OUT / '02-save-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    if not result.get('ok'):
        raise SystemExit('saveParted falló: ' + json.dumps(result, ensure_ascii=False)[:500])

    print('3) Verificando…')
    after = fetch_json('GET', API + '?action=getState&merge=1')
    ast = after['data']['state']
    got = (ast.get('sacCargas') or {}).get(NEW_KEY) or []
    vs_got = vs_est_list((ast.get('vsData') or {}).get(NEW_KEY))
    checks = {
        'ok': after.get('ok'),
        'version': (after.get('meta') or {}).get('version'),
        'lastUser': (after.get('meta') or {}).get('lastUser'),
        'old_week_equal': dump((ast.get('sacCargas') or {}).get(OLD_KEY)) == old_before,
        'other_weeks_equal': dump(other_keys_blob(ast, NEW_KEY)) == other_before,
        'extra_equal': dump((ast.get('vsExtraData') or {}).get(NEW_KEY)) == extra_before,
        'cierres_equal': dump(ast.get('sacCierresHistorial')) == cierres_before,
        'creditos_equal': dump(ast.get('creditos')) == cred_before,
        'facturas_equal': dump(ast.get('facturas')) == fac_before,
        'propinas_equal': dump(ast.get('propinas')) == prop_before,
        'informes_equal': dump(ast.get('informesDiarios')) == inf_before,
        'inventario_equal': dump({k: ast.get(k) for k in P_INV}) == inv_before,
        'period': ast.get('sacPeriodoTrabajo'),
        'new_n': len(got),
        'new_total': sum((c or {}).get('monto') or 0 for c in got),
        'new_names': [c.get('nombre') for c in got],
        'new_estados': sorted({c.get('estado') for c in got}),
        'vs_est': vs_got,
        'vs_total': sum(vs_got),
        'sac_keys': sorted((ast.get('sacCargas') or {}).keys()),
    }
    (OUT / '03-verify.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: checks[k] for k in checks if k != 'new_names'}, ensure_ascii=False, indent=2))
    ok = (
        checks['old_week_equal'] and checks['other_weeks_equal'] and checks['extra_equal']
        and checks['cierres_equal'] and checks['creditos_equal'] and checks['facturas_equal']
        and checks['propinas_equal'] and checks['informes_equal'] and checks['inventario_equal']
        and checks['period'] == PERIOD
        and checks['new_n'] == EXPECTED_N and checks['new_total'] == EXPECTED_TOTAL
        and checks['new_estados'] == ['nopagado']
        and checks['new_names'] == [n for n, _, _ in CARGAS]
        and checks['vs_est'] == VS_EST
        and checks['vs_total'] == EXPECTED_VS_TOTAL
    )
    if not ok:
        raise SystemExit('VERIFICACIÓN FALLÓ')
    print('OK', OUT)


if __name__ == '__main__':
    main()
