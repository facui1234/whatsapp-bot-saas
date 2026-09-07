# Conciliación de compras de crudo

Esta aplicación te dice, en cualquier momento: **qué documentos te faltan
recibir de cada proveedor y por cuánto**, y **a qué valor tenés que dejar
valuada cada compra** para el cierre contable del mes.

Corre 100% en tu máquina. No usa internet, no usa la nube, no usa Docker.
Toda la información queda en un solo archivo (`data/conciliacion.db`) que
podés backupear con un botón desde la propia app.

No hace falta saber programar para usarla: seguí los pasos de abajo tal
cual están escritos.

---

## 1. Instalar lo necesario (una sola vez)

Necesitás tener **Python 3.10 o más nuevo** instalado en tu computadora.

- **¿Cómo sé si ya lo tengo?** Abrí una terminal (en Windows: buscá "cmd" o
  "PowerShell" en el menú de inicio; en Mac: buscá "Terminal") y escribí:

  ```
  python --version
  ```

  Si te muestra algo como `Python 3.11.5`, ya lo tenés y podés pasar al
  paso 2.

- **Si no lo tenés**, descargalo de https://www.python.org/downloads/ e
  instalalo. **Importante en Windows**: en la primera pantalla del
  instalador, tildá la casilla que dice **"Add Python to PATH"** antes de
  hacer clic en "Install Now".

## 2. Bajar esta carpeta a tu computadora

Si ya tenés esta carpeta (por ejemplo porque te la pasaron o la clonaste
de un repositorio), andá directo al paso 3.

## 3. Arrancar la aplicación (un solo comando)

Abrí una terminal **dentro de esta carpeta** (en Windows podés escribir
`cmd` en la barra de direcciones del Explorador de Windows estando parado
en la carpeta, y apretar Enter) y ejecutá:

- **Windows**: doble clic en el archivo `run.bat` (o escribí `run.bat` en
  la consola y apretá Enter).
- **Mac / Linux**: escribí en la terminal:

  ```
  bash run.sh
  ```

La primera vez va a tardar un minuto o dos: crea un entorno propio para no
mezclarse con nada más de tu computadora, e instala las librerías que
necesita (Streamlit, pandas, etc.). Las próximas veces arranca en
segundos.

Cuando termine, te va a decir algo como:

```
Local URL: http://localhost:8501
```

Abrí esa dirección en tu navegador (Chrome, Edge, lo que uses). Si no se
abre solo, copiá y pegá `http://localhost:8501` en la barra de
direcciones.

**Para cerrar la app**: volvé a la terminal y apretá `Ctrl + C`. Para
volver a abrirla, repetí este paso 3 (`run.bat` o `bash run.sh`).

La primera vez que la abrís, la app carga sola unos datos de ejemplo para
que veas cómo funciona todo antes de meter tus datos reales.

---

## 4. Armar un `.exe` para abrirla con doble clic (opcional)

Si no querés depender de la consola, podés armar **un único archivo
`ConciliacionCrudo.exe`**: lo copiás donde quieras y lo abrís con doble
clic, como cualquier otro programa. No necesita que Python esté instalado
en la máquina donde después lo uses.

**Esto se hace UNA sola vez, y hay que hacerlo en una computadora con
Windows** (un `.exe` de Windows sólo se puede generar desde Windows).

1. En la computadora con Windows, con Python instalado (paso 1), abrí esta
   carpeta y hacé doble clic en **`construir_exe.bat`**.
2. Tarda varios minutos (baja e incluye adentro todo lo que la app
   necesita). Cuando termina, te avisa.
3. Tu programa queda en **`dist\ConciliacionCrudo.exe`**.

Ahora podés copiar ese `.exe` al Escritorio, a una carpeta de red o a un
pendrive, y abrirlo con doble clic. Se abre una ventana negra con un
mensaje de "Arrancando..." y a los pocos segundos se abre solo el
navegador con la aplicación.

Tres cosas importantes:

- **No cierres la ventana negra** mientras estés usando la app: es el
  programa corriendo. Para cerrar la aplicación, cerrá esa ventana.
- **La primera vez tarda entre 20 y 40 segundos en abrir** (tiene que
  descomprimirse). Las veces siguientes es más rápido. Si te resulta muy
  lento, abrí `ConciliacionCrudo.spec` con el Bloc de notas y cambiá
  `UN_SOLO_ARCHIVO = True` por `UN_SOLO_ARCHIVO = False`: vas a obtener
  una carpeta con el `.exe` adentro que arranca mucho más rápido (pero
  tenés que mover la carpeta entera, no sólo el `.exe`).
- **Los datos se guardan en una carpeta `data` al lado del `.exe`.** Si
  movés el `.exe` a otro lado, llevate también esa carpeta `data`, o vas
  a arrancar con la base vacía. (Igual siempre tenés el botón de backup.)

En Mac o Linux el equivalente es `bash construir_exe.sh`, y el programa
queda en `dist/ConciliacionCrudo`.

## 5. Cómo está organizada la app

En el menú de la izquierda vas a ver estas pantallas:

1. **Conciliación de compras de crudo** (la principal / Dashboard): totales
   del mes, cuánto está valuado a precio estimado vs. final, y cuánto
   falta documentar.
2. **🚨 Faltantes**: la pantalla más importante en el día a día. Te dice
   qué Nota de Débito o de Crédito falta, de qué proveedor, por cuánto y
   hace cuántos días. Se puede filtrar y exportar a Excel — es lo que
   usás para reclamarle al proveedor.
3. **📄 Documentos**: para cargar a mano una factura, ND o NC. Si el
   sistema encuentra la entrega exacta (por número de remito u OC), la
   imputa sola. Si no, queda en la pestaña "Pendientes de imputar" para
   que elijas vos a qué entrega corresponde.
4. **🚚 Entregas**: listado de todo lo que recibiste, con un formulario
   para cargar o editar a mano, y el detalle paso a paso de cómo se
   calculó el delta de cada una.
5. **💲 Precios**: una grilla rápida para cargar de una vez todos los
   precios del mes (marcando si son estimados o finales), más el
   historial completo de versiones de cada precio (nunca se borra ni se
   pisa un precio viejo) y el tipo de cambio de referencia del período.
6. **📥 Importar**: acá descargás las plantillas de Excel, subís las que
   completaste, y también importás los CSV que exportás de SAP (FBL1N /
   MB51).
7. **🔒 Cierres**: para cerrar un período contable (queda congelado para
   siempre), ver el histórico de cierres, exportar el asiento de
   provisión, ver los ajustes que se generan cuando un precio pasa de
   estimado a final después de cerrado el mes, configurar la tolerancia,
   y ver el registro de auditoría (quién cargó o cambió qué y cuándo).

## 6. El flujo de trabajo típico, mes a mes

1. **Cargá las entregas** del mes (a mano, una por una, o subiendo el
   Excel de la plantilla) en la pantalla **Entregas** o **Importar**.
2. **Cargá los precios** del mes en la grilla rápida de **Precios**,
   marcando cada uno como "estimado" o "final" (usá "estimado" si todavía
   no cerró el precio oficial).
3. A medida que te llegan **facturas, ND y NC** del proveedor, cargalas en
   **Documentos** (a mano, por Excel, o importando el CSV de SAP). El
   sistema intenta emparejarlas solo con la entrega correspondiente.
4. Mirá la pantalla **Faltantes** para saber qué le tenés que reclamar a
   cada proveedor.
5. Cuando el mes está lo más completo posible, andá a **Cierres** y
   cerrá el período: queda un snapshot congelado con el valor a
   provisionar, y podés exportar el asiento contable.
6. Si más adelante te llega el precio **final** de un mes ya cerrado, lo
   cargás igual en Precios: el sistema no toca el mes cerrado, pero
   registra automáticamente el ajuste como un movimiento del **mes
   corriente** (lo ves en Cierres → Ajustes posteriores).

## 7. Cómo funciona el cálculo (para entender los números)

Por cada entrega:

```
precio_aplicable = precio FINAL del período/producto/proveedor si existe;
                    si no, el precio ESTIMADO más reciente.
valor_teórico     = volumen × precio_aplicable
neto_documentado  = facturas + ND − NC imputadas a esa entrega (siempre sin IVA)
delta_total       = valor_teórico − neto_documentado
```

- Si `delta_total` es mayor a la tolerancia → **falta una Nota de Débito**.
- Si es menor a menos la tolerancia → **falta una Nota de Crédito**.
- Si está dentro de la tolerancia → **conciliada**.

El delta total se separa en:
- **delta por precio**: la diferencia atribuible al precio en sí.
- **delta por tipo de cambio**: cuánto de la diferencia es porque el
  proveedor facturó en una moneda distinta a la del precio (por ejemplo,
  precio en USD, factura en pesos) a un tipo de cambio distinto al de
  referencia del período.
- **delta por volumen** (informativo): si llega una ND/NC que ajusta el
  volumen (medición final, mermas, %BSW), se ve acá cuánto movió el valor
  teórico respecto del volumen original del remito.

La tolerancia se configura en **Cierres → ⚙️ Tolerancias** (una global y,
opcionalmente, una distinta por proveedor).

## 8. Backup de la base de datos

En cualquier pantalla, en la barra de la izquierda, hay un botón
**"💾 Descargar backup de la base"**. Te baja un archivo `.db` con toda la
información hasta ese momento. Guardalo en un lugar seguro (por ejemplo,
un backup semanal a un pendrive o a la nube de tu empresa).

## 9. Preguntas frecuentes

**¿Dónde queda guardada la información?**
En el archivo `data/conciliacion.db`, dentro de esta misma carpeta. Si
borrás esa carpeta perdés los datos (por eso conviene usar el backup).

**Metí mal un dato en la plantilla de Excel, ¿qué pasa?**
Nada se guarda: la app valida todo el archivo antes de guardar cualquier
fila, y te muestra una tabla con la fila, la columna y qué está mal en
castellano. Corregís el Excel y lo volvés a subir.

**¿Puedo tener varias personas cargando datos al mismo tiempo?**
La app está pensada para uso local, de una persona a la vez, en su propia
computadora (por eso no hace falta ni instalar un servidor ni configurar
usuarios). El registro de auditoría (Cierres → 📝 Auditoría) igual queda
guardado por si varias personas comparten el mismo archivo de base.

**Me equivoqué en un precio o entrega, ¿lo puedo borrar?**
Las entregas y precios se editan desde su pantalla mientras el período
esté abierto. Una vez que cerrás el período, esa entrega queda bloqueada
(no se puede tocar): si necesitás corregir un precio, cargalo igual en
Precios y el sistema genera el ajuste como movimiento del mes corriente.

**¿Cómo prueban que el motor de conciliación calcula bien?**
Con tests automáticos (`pytest`). Para correrlos vos mismo (no es
obligatorio, es para quien quiera verificarlo):

```
# Windows
.venv\Scripts\activate
pytest

# Mac / Linux
source .venv/bin/activate
pytest
```

Deberías ver algo como `25 passed`.

---

## Para quien sí programa: detalles técnicos

- **Stack**: Python, SQLite (un solo archivo), Streamlit para la interfaz.
  Sin Docker ni servicios externos; todo corre local con `streamlit run app.py`.
- **Estructura**:
  - `core/db.py`: conexión y helpers CRUD + auditoría sobre SQLite.
  - `core/schema.sql`: esquema completo (entregas, precios, documentos,
    imputaciones, cierres, ajustes_posteriores, tipos_cambio,
    configuracion, tolerancias_proveedor, sap_mapeos, auditoria).
  - `core/reconciliation.py`: motor de conciliación, **puro** (sin
    Streamlit ni sqlite3), con la fórmula documentada en el docstring.
  - `core/matching.py`: matcheo automático documento↔entrega (exacto /
    aproximado / pendiente), también puro.
  - `core/repository.py`: puente entre la base y la lógica pura; acá vive
    el cierre contable, los ajustes posteriores y el asiento de provisión.
  - `core/validators.py` / `core/importers.py` / `core/templates.py`:
    validación, importación (Excel y SAP) y generación de plantillas.
  - `core/seed.py`: datos de ejemplo cargados en el primer arranque.
  - `app.py` + `pages/*.py`: interfaz Streamlit (multipágina).
  - `tests/`: suite de `pytest` sobre `core/reconciliation.py`,
    `core/matching.py` y el flujo de cierre (25 tests).
  - `lanzador.py` + `ConciliacionCrudo.spec`: empaquetado con PyInstaller.
    El lanzador busca un puerto libre, arranca Streamlit vía
    `streamlit.web.cli` y abre el navegador. `core/db.py` detecta
    `sys.frozen` para leer `schema.sql` desde `sys._MEIPASS` y guardar la
    base **al lado del ejecutable** (no en el temporal, que se borra).
- **Correr en modo desarrollo** sin pasar por `run.sh`/`run.bat`:
  ```
  python3 -m venv .venv && source .venv/bin/activate
  pip install -r requirements.txt
  streamlit run app.py
  ```
