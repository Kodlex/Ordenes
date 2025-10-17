// Asegúrate de que firebase y db estén inicializados en script_firebase.js (debe estar incluido)

class StockManager {
    constructor(){
        this.unsubscribeStockGeneral = null;
        this.unsubscribeStockEquipos = [];
        this.unsubscribeStockMovements = null; // NUEVO: Listener para movimientos
        this.stockGeneralData = {};
        this.TEAMS = ['1', '2', '3', '4', '5'];
        this.managerUser = null; // Se inicializa en checkLogin
        
        // Lista de materiales con NUEVA propiedad minStock (Umbral de Alerta)
        this.stockMateriales = [
            { id: 'drop', label: 'Drop', unidad: 'm', type: 'number', minStock: 500 }, // Ejemplo: 500m de drop como mínimo
            { id: 'conectorFTTH', label: 'Conector FTTH', unidad: 'u', type: 'number', minStock: 30 },
            { id: 'coaxial', label: 'Coaxial', unidad: 'm', type: 'number', minStock: 300 },
            { id: 'conectorRG6', label: 'Conector RG6', unidad: 'u', type: 'number', minStock: 20 },
            { id: 'grampas', label: 'Grampas', unidad: 'u', type: 'number', minStock: 500 },
            { id: 'splitter', label: 'Splitter', unidad: 'u', type: 'number', minStock: 10 },
            { id: 'conectorRJ45', label: 'Conector RJ45', unidad: 'u', type: 'number', minStock: 50 },
            { id: 'fuente', label: 'Fuente', unidad: 'u', type: 'number', minStock: 5 },
            { id: 'router', label: 'Router', unidad: 'u', type: 'number', minStock: 5 },
            { id: 'patchCord', label: 'Patch Cord', unidad: 'u', type: 'number', minStock: 15 },
            { id: 'observacionMaterial', label: 'Observación Material (Texto)', type: 'text' },
        ];
        
        this.checkLogin();
        this.init();
    }

    checkLogin() {
        const user = localStorage.getItem('userName');
        const userType = localStorage.getItem('userType');
        if (!user || userType !== 'admin') {
            window.location.href = 'login_admin.html'; // Redirige si no está logeado como admin
            return;
        }
        document.getElementById('userDisplay').textContent = `Stock: ${user}`;
        this.managerUser = user; // Almacena el nombre del usuario logeado para la trazabilidad
    }

    logout() {
        localStorage.removeItem('userName');
        localStorage.removeItem('userType');
        window.location.href = 'login_admin.html';
    }

    init() {
        document.getElementById('logoutBtn').addEventListener('click', this.logout);
        document.getElementById('formIngresoStock')?.addEventListener('submit', (e) => this.handleIngresoStock(e));
        document.getElementById('formAsignarMaterial')?.addEventListener('submit', (e) => this.handleAsignarMaterial(e));
        
        // --- LISTENERS PARA FILTROS ---
        document.getElementById('filtroStockGeneral')?.addEventListener('input', () => this.applyStockGeneralFilters());
        document.getElementById('filtroAlertaStock')?.addEventListener('change', () => this.applyStockGeneralFilters());
        document.getElementById('filtroAsignacionEquipos')?.addEventListener('input', () => this.applyAsignacionEquiposFilter());
        
        // --- NUEVOS LISTENERS PARA REPORTE DE MATERIALES CONSUMIDOS ---
        document.getElementById('formUsedMaterialsFilter')?.addEventListener('submit', (e) => this.handleUsedMaterialsFilter(e));
        // --- FIN LISTENERS ---

        this.generateStockModalInputs();
        this.loadStockGeneralRealtime();
        this.loadAsignacionEquiposRealtime();
        this.loadStockMovementsRealtime(); // NUEVO: Carga la trazabilidad
        
        // Establecer fechas por defecto para el reporte (Ej: Últimos 30 días)
        this.setDefaultReportDates();
    }

    // =================================================================
    // =========== LÓGICA DE TRAZABILIDAD (MOVIMIENTOS) ================
    // =================================================================

    loadStockMovementsRealtime() {
        if (this.unsubscribeStockMovements) this.unsubscribeStockMovements();

        this.unsubscribeStockMovements = db.collection('stock_movements')
            .orderBy('timestamp', 'desc')
            .limit(10) // Mostrar solo los últimos 10 movimientos
            .onSnapshot(snapshot => {
                const movements = snapshot.docs.map(doc => doc.data());
                this.renderStockMovements(movements);
            }, err => {
                console.error("Error al obtener movimientos de stock:", err);
            });
    }

    renderStockMovements(movements) {
        const container = document.getElementById('stockMovementsContainer');
        if (!container) return;

        if (movements.length === 0) {
            container.innerHTML = `<div class="text-center text-muted py-3">No se han registrado movimientos recientes.</div>`;
            return;
        }

        const rows = movements.map(m => {
            // Convierte el timestamp de Firebase a objeto Date
            const date = m.timestamp.toDate ? m.timestamp.toDate() : new Date(); 
            const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            
            const isEntry = m.type === 'ENTRADA';
            const icon = isEntry ? 'fas fa-arrow-circle-up text-success' : 'fas fa-arrow-circle-down text-danger';
            const teamInfo = m.teamId ? `(Equipo ${m.teamId})` : '';

            return `
                <li class="list-group-item p-2 d-flex justify-content-between align-items-start">
                    <div>
                        <i class="${icon} me-2"></i> 
                        <strong>${m.materialLabel}</strong>: ${isEntry ? '+' : '-'} ${m.quantity.toFixed(0)} ${m.unidad} ${teamInfo}
                        <div class="text-muted small">
                            ${m.notes || (isEntry ? 'Ingreso de proveedor' : 'Asignación de material')}
                        </div>
                    </div>
                    <small class="text-end text-muted mt-1">
                        ${dateStr} ${timeStr}<br>
                        ${m.manager}
                    </small>
                </li>
            `;
        }).join('');

        container.innerHTML = `<ul class="list-group list-group-flush small">${rows}</ul>`;
    }

    async registerStockMovement(type, materialId, quantity, notes, teamId = null) {
        // Busca el label y unidad del material
        const materialDetails = this.stockMateriales.find(m => m.id === materialId);
        
        if (!materialDetails) {
            console.error(`Error: No se encontró el material con ID ${materialId}`);
            return;
        }
        
        const movementData = {
            type: type, // 'ENTRADA' o 'ASIGNACION'
            materialId: materialId,
            materialLabel: materialDetails.label,
            unidad: materialDetails.unidad,
            quantity: quantity,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            manager: this.managerUser || 'Admin_Desconocido', // Usuario logeado
            notes: notes,
            teamId: teamId
        };
        
        try {
            await db.collection('stock_movements').add(movementData);
        } catch (err) {
            console.error('Error al registrar el movimiento de stock:', err);
        }
    }


    // =================================================================
    // =========== LÓGICA DE FILTRO Y REPORTE DE CONSUMO ===============
    // =================================================================
    
    // Utilidad para establecer las fechas por defecto para el filtro (ej. 30 días)
    setDefaultReportDates() {
        const endDateInput = document.getElementById('endDateFilterUsed');
        const startDateInput = document.getElementById('startDateFilterUsed');
        if (endDateInput && startDateInput) {
            const today = new Date();
            const last30Days = new Date();
            last30Days.setDate(today.getDate() - 30);
            
            // Función auxiliar para formatear la fecha a YYYY-MM-DD
            const formatDate = (date) => {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            };

            endDateInput.value = formatDate(today);
            startDateInput.value = formatDate(last30Days);
        }
    }
    
    // Maneja el envío del formulario de filtros de materiales consumidos
    handleUsedMaterialsFilter(e) {
        e.preventDefault();
        const form = document.getElementById('formUsedMaterialsFilter');
        // Usa la validación de Bootstrap para requerir los campos
        form.classList.add('was-validated'); 
        if (!form.checkValidity()) {
            return;
        }

        const equipoId = document.getElementById('equipoFilterUsed').value;
        const startDateStr = document.getElementById('startDateFilterUsed').value;
        const endDateStr = document.getElementById('endDateFilterUsed').value;

        // Las fechas de entrada son YYYY-MM-DD
        const startDate = new Date(startDateStr);
        // Para incluir todo el día de fin, sumamos 23:59:59.999
        const endDate = new Date(endDateStr);
        endDate.setHours(23, 59, 59, 999); 
        
        this.loadUsedMaterialsReport(equipoId, startDate, endDate);
    }
    
    // Carga y procesa el reporte de materiales consumidos
    async loadUsedMaterialsReport(equipoId, startDate, endDate) {
        const container = document.getElementById('usedMaterialsContainer');
        container.innerHTML = `<div class="text-center text-muted py-5">
                                <i class="fas fa-spinner fa-spin fa-2x mb-3"></i>
                                <h6>Cargando reporte para Equipo ${equipoId}...</h6>
                               </div>`;

        try {
            // Se asume que 'db' y 'firebase' están disponibles globalmente (desde script_firebase.js)
            const startTimestamp = firebase.firestore.Timestamp.fromDate(startDate);
            const endTimestamp = firebase.firestore.Timestamp.fromDate(endDate);
            
            // 1. Consultar órdenes completadas para el equipo en el rango de fechas
            const q = db.collection('ordenes')
                .where('estado', '==', 'completado')
                .where('instalacion.equipo', '==', equipoId)
                // 'fechaCompletado' es el campo de la orden completada por el técnico
                .where('fechaCompletado', '>=', startTimestamp)
                .where('fechaCompletado', '<=', endTimestamp)
                .orderBy('fechaCompletado', 'desc');

            const snapshot = await q.get();
            const completedOrders = snapshot.docs.map(doc => doc.data());

            // 2. Agregar los materiales gastados de todas las órdenes
            const aggregation = {};
            let totalOrders = 0;

            completedOrders.forEach(order => {
                const materiales = order.materialesGastados || {};
                totalOrders++;
                
                // Iterar sobre la lista de materiales estándar (solo los de tipo 'number')
                this.stockMateriales.forEach(m => {
                    if (m.type === 'number') {
                        // Usamos parseInt para asegurarnos de que el valor sea un número
                        const consumed = parseInt(materiales[m.id] || 0);
                        if (consumed > 0) {
                            aggregation[m.id] = (aggregation[m.id] || 0) + consumed;
                        }
                    } 
                });
            });

            // 3. Renderizar el reporte
            this.renderUsedMaterialsReport(aggregation, equipoId, startDate, endDate, totalOrders);

        } catch (err) {
            console.error('Error cargando el reporte de materiales consumidos:', err);
            container.innerHTML = `<div class="text-danger p-3 text-center">
                                     <i class="fas fa-exclamation-triangle me-2"></i>Error al cargar el reporte. Revisa la consola.
                                   </div>`;
        }
    }

    // Renderiza la tabla de Materiales Consumidos
    renderUsedMaterialsReport(aggregation, equipoId, startDate, endDate, totalOrders) {
        const container = document.getElementById('usedMaterialsContainer');
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        const startTxt = startDate.toLocaleDateString('es-ES', options);
        const endTxt = endDate.toLocaleDateString('es-ES', options);
        
        // Filtrar y preparar los materiales utilizados
        const aggregatedMaterials = this.stockMateriales
            .filter(m => m.type === 'number') // Solo materiales con cantidad
            .map(m => ({
                label: m.label,
                unidad: m.unidad,
                total: aggregation[m.id] || 0
            }))
            .filter(m => m.total > 0); // Solo mostrar los que se usaron

        if (totalOrders === 0) {
            container.innerHTML = `<div class="text-muted p-3 text-center">
                                     <h6>No se encontraron órdenes completadas por el Equipo ${equipoId} en el periodo seleccionado.</h6>
                                   </div>`;
            return;
        }

        if (aggregatedMaterials.length === 0) {
            container.innerHTML = `<div class="text-muted p-3 text-center">
                                     <h6>✅ Equipo ${equipoId} no consumió materiales contables entre ${startTxt} y ${endTxt} en **${totalOrders}** órdenes.</h6>
                                   </div>`;
            return;
        }

        const rows = aggregatedMaterials.map(m => `
            <tr>
                <td><strong>${m.label}</strong></td>
                <td class="text-end">${m.total.toFixed(0)}</td>
                <td>${m.unidad}</td>
            </tr>
        `).join('');

        const tableHtml = `
            <p class="small text-muted mb-2 text-center">
                Reporte para **Equipo ${equipoId}** | Órdenes Completadas: **${totalOrders}** <br>
                Periodo: ${startTxt} - ${endTxt}
            </p>
            <div class="table-responsive">
                <table class="table table-striped table-hover table-sm small">
                    <thead class="table-danger">
                        <tr>
                            <th>Material</th>
                            <th class="text-end">Cantidad Usada</th>
                            <th>Unidad</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
        container.innerHTML = tableHtml;
    }


    // =================================================================
    // =========== LÓGICA DE STOCK GENERAL (ALERTA) ====================
    // =================================================================

    loadStockGeneralRealtime() {
        if (this.unsubscribeStockGeneral) this.unsubscribeStockGeneral();

        this.unsubscribeStockGeneral = db.collection('stockGeneral').doc('general')
            .onSnapshot(doc => {
                if (doc.exists) {
                    this.stockGeneralData = doc.data() || {};
                    this.renderStockGeneral();
                    // Obtener el umbral del conector FTTH (como referencia)
                    const sampleMinStock = this.stockMateriales.find(m => m.id === 'conectorFTTH')?.minStock || 30;
                    document.getElementById('minStockDisplay').textContent = `${sampleMinStock} u`;
                } else {
                    this.stockGeneralData = {};
                    this.renderStockGeneral();
                    console.log("Documento de stock general no encontrado. Creando uno vacío.");
                    // Inicializar si no existe
                    db.collection('stockGeneral').doc('general').set({});
                }
            }, err => {
                console.error("Error al obtener stock general:", err);
            });
    }

    renderStockGeneral() {
        let filtroTexto = document.getElementById('filtroStockGeneral')?.value.toLowerCase() || '';
        let filtroAlerta = document.getElementById('filtroAlertaStock')?.value || 'todos';

        const tableBody = document.getElementById('stockGeneralContainer');
        let html = '';
        
        const filteredMaterials = this.stockMateriales.filter(m => m.type === 'number').filter(m => {
            const label = m.label.toLowerCase();
            const stock = this.stockGeneralData[m.id] || 0;
            // Usamos el minStock definido para el umbral de alerta
            const minStock = m.minStock || 50; 
            const isInAlert = stock < minStock; 

            const matchesText = label.includes(filtroTexto);
            const matchesAlert = filtroAlerta === 'todos' || (filtroAlerta === 'alerta' && isInAlert);

            return matchesText && matchesAlert;
        });

        if (filteredMaterials.length > 0) {
            const rows = filteredMaterials.map(m => {
                const stock = this.stockGeneralData[m.id] || 0;
                const minStock = m.minStock || 50; 
                const isWarning = stock < minStock && stock > 0;
                const isCritical = stock <= 0;
                
                let rowClass = '';
                let estadoText = 'Normal';
                if (isCritical) {
                    rowClass = 'table-danger fw-bold';
                    estadoText = '<i class="fas fa-exclamation-circle me-1"></i> CRÍTICO';
                } else if (isWarning) {
                    rowClass = 'table-warning fw-bold';
                    estadoText = `<i class="fas fa-exclamation-triangle me-1"></i> Alerta (${minStock} ${m.unidad})`;
                }

                return `
                    <tr class="${rowClass}">
                        <td>${m.label}</td>
                        <td class="text-end">${stock.toFixed(0)}</td>
                        <td>${m.unidad}</td>
                        <td>${estadoText}</td>
                    </tr>
                `;
            }).join('');

            html = `
                <div class="table-responsive">
                    <table class="table table-striped table-hover table-sm small">
                        <thead class="table-success sticky-top">
                            <tr>
                                <th>Material</th>
                                <th class="text-end">Stock</th>
                                <th>Unidad</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            html = `<div class="text-center text-muted py-5">
                        <h6>${filtroAlerta === 'alerta' ? 'No hay materiales en alerta.' : 'No se encontraron materiales.'}</h6>
                    </div>`;
        }
        
        if(tableBody) tableBody.innerHTML = html;
    }

    applyStockGeneralFilters() {
        this.renderStockGeneral();
    }

    async handleIngresoStock(e) {
        e.preventDefault();
        const form = document.getElementById('formIngresoStock');
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }
        
        const supplierNotes = document.getElementById('supplierOrNotes').value.trim();

        const updates = {};
        const movements = [];
        let hasUpdates = false;

        this.stockMateriales.filter(m => m.type === 'number').forEach(m => {
            const input = document.getElementById(`ingreso_${m.id}`);
            const amount = parseInt(input.value) || 0;
            if (amount > 0) {
                updates[m.id] = firebase.firestore.FieldValue.increment(amount);
                movements.push({ materialId: m.id, quantity: amount, notes: supplierNotes });
                hasUpdates = true;
            }
        });

        if (!hasUpdates) {
            this.showSuccess('No se ingresó ninguna cantidad positiva.');
            return;
        }

        const stockGeneralRef = db.collection('stockGeneral').doc('general');

        try {
            const batch = db.batch();
            batch.set(stockGeneralRef, updates, { merge: true }); // Usamos SET con merge para asegurar que el doc exista
            
            await batch.commit();

            // Registrar movimientos DEPUÉS de la actualización exitosa
            for (const mov of movements) {
                await this.registerStockMovement('ENTRADA', mov.materialId, mov.quantity, mov.notes);
            }
            
            this.showSuccess('Stock ingresado y registrado con éxito.', 'Ingreso Completado');
            form.reset();
            form.classList.remove('was-validated');
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalIngresoStock'));
            modal.hide();
        } catch (err) {
            console.error('Error al ingresar stock:', err);
            this.showError('Error al ingresar stock. Revisa la consola.', 'Fallo en la Operación');
        }
    }

    // =================================================================
    // =========== LÓGICA DE STOCK POR EQUIPO (CORRECCIÓN) =============
    // =================================================================
    
    loadAsignacionEquiposRealtime() {
        const container = document.getElementById('asignacionEquiposContainer');
        
        // CORRECCIÓN: Limpiar el mensaje inicial de "Cargando stock de equipos..."
        if (container) {
            // Limpiamos el HTML para que las tarjetas de los equipos se añadan de cero
            // Si tiene hijos y el primer hijo contiene el texto de carga.
            if (container.children.length === 1 && container.children[0].textContent.includes('Cargando stock de equipos')) {
                 container.innerHTML = '';
            }
        }

        // Limpiar listeners anteriores
        this.unsubscribeStockEquipos.forEach(unsub => unsub());
        this.unsubscribeStockEquipos = [];

        this.TEAMS.forEach(equipoId => {
            const unsub = db.collection('stockEquipos').doc(`equipo_${equipoId}`)
                .onSnapshot(doc => {
                    const data = doc.data() || {};
                    this.renderStockEquipo(equipoId, data);
                    this.applyAsignacionEquiposFilter(); // Re-renderiza para aplicar filtro
                }, err => {
                    console.error(`Error al obtener stock de Equipo ${equipoId}:`, err);
                });
            this.unsubscribeStockEquipos.push(unsub);
        });
    }

    renderStockEquipo(equipoId, data) {
        const container = document.getElementById('asignacionEquiposContainer');
        let equipoCard = document.getElementById(`equipoCard_${equipoId}`);

        if (!container) return; // Salir si el contenedor no existe

        if (!equipoCard) {
            // Si la tarjeta no existe, la creamos y la añadimos al contenedor.
            equipoCard = document.createElement('div');
            equipoCard.id = `equipoCard_${equipoId}`;
            equipoCard.classList.add('accordion-item', 'mb-2');
            container.appendChild(equipoCard);
        }

        const itemsHTML = this.stockMateriales.filter(m => m.type === 'number').map(m => {
            const stock = data[m.id] || 0;
            const minStock = m.minStock || 10;
            const isLow = stock < minStock; // Umbral de alerta por equipo
            return `
                <li class="list-group-item d-flex justify-content-between align-items-center p-1 small" data-material="${m.label.toLowerCase()}">
                    ${m.label}
                    <span class="badge ${isLow ? 'bg-danger' : 'bg-primary'} rounded-pill">${stock.toFixed(0)} ${m.unidad}</span>
                </li>
            `;
        }).join('');

        equipoCard.innerHTML = `
            <h2 class="accordion-header" id="headingEquipo${equipoId}">
                <button class="accordion-button collapsed bg-purple text-white p-2" type="button" data-bs-toggle="collapse" data-bs-target="#collapseEquipo${equipoId}" aria-expanded="false" aria-controls="collapseEquipo${equipoId}">
                    <i class="fas fa-tools me-2"></i> **Equipo ${equipoId}**
                </button>
            </h2>
            <div id="collapseEquipo${equipoId}" class="accordion-collapse collapse" aria-labelledby="headingEquipo${equipoId}">
                <div class="accordion-body p-0">
                    <ul class="list-group list-group-flush small" id="listGroupEquipo${equipoId}">
                        ${itemsHTML}
                    </ul>
                </div>
            </div>
        `;
    }

    applyAsignacionEquiposFilter() {
        const filterText = document.getElementById('filtroAsignacionEquipos')?.value.toLowerCase() || '';
        
        this.TEAMS.forEach(equipoId => {
            const card = document.getElementById(`equipoCard_${equipoId}`);
            if (!card) return;

            const listGroup = document.getElementById(`listGroupEquipo${equipoId}`);
            let hasVisibleMaterial = false;

            if (listGroup) {
                const materials = listGroup.querySelectorAll('li');
                materials.forEach(li => {
                    const materialName = li.getAttribute('data-material');
                    const isVisible = materialName.includes(filterText);
                    li.style.display = isVisible ? '' : 'none';
                    if (isVisible) {
                        hasVisibleMaterial = true;
                    }
                });
            }

            const teamNameMatch = `equipo ${equipoId}`.includes(filterText);

            if (teamNameMatch || hasVisibleMaterial || filterText === '') {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    }

    generateStockModalInputs() {
        const inputContainerIngreso = document.getElementById('ingresoStockInputs');
        const inputContainerAsignar = document.getElementById('asignarMaterialInputs');

        const inputsHTML = this.stockMateriales.filter(m => m.type === 'number').map(m => `
            <div class="mb-3">
                <label for="ingreso_${m.id}" class="form-label">${m.label} (${m.unidad})</label>
                <input type="number" class="form-control" id="ingreso_${m.id}" name="${m.id}" min="0" value="0">
                <div class="invalid-feedback">Debe ser un número positivo.</div>
            </div>
        `).join('');
        
        // Reemplazar IDs para el modal de Asignación
        const asignarHTML = this.stockMateriales.filter(m => m.type === 'number').map(m => `
            <div class="mb-3">
                <label for="asignar_${m.id}" class="form-label">${m.label} (${m.unidad})</label>
                <input type="number" class="form-control" id="asignar_${m.id}" name="${m.id}" min="0" value="0">
                <div class="invalid-feedback" id="feedback_asignar_${m.id}">Debe ser un número positivo.</div>
            </div>
        `).join('');


        if(inputContainerIngreso) inputContainerIngreso.innerHTML = inputsHTML;
        if(inputContainerAsignar) inputContainerAsignar.innerHTML = asignarHTML;
    }

    async handleAsignarMaterial(e) {
        e.preventDefault();
        const form = document.getElementById('formAsignarMaterial');
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }

        const equipoId = document.getElementById('equipoAsignar').value;
        const assignmentNotes = document.getElementById('assignmentNotes').value.trim();
        const asignacionUpdates = {};
        const stockGeneralUpdates = {};
        const movements = [];
        let hasUpdates = false;
        let validationError = false;
        
        // Limpiar mensajes de error anteriores
        this.stockMateriales.filter(m => m.type === 'number').forEach(m => {
            const input = document.getElementById(`asignar_${m.id}`);
            input.classList.remove('is-invalid');
            input.setCustomValidity('');
            const feedback = document.getElementById(`feedback_asignar_${m.id}`);
            if (feedback) feedback.textContent = 'Debe ser un número positivo.';
        });


        this.stockMateriales.filter(m => m.type === 'number').forEach(m => {
            const input = document.getElementById(`asignar_${m.id}`);
            const feedback = document.getElementById(`feedback_asignar_${m.id}`);
            const assigned = parseInt(input.value) || 0;
            
            if (assigned > 0) {
                const stockGeneral = this.stockGeneralData[m.id] || 0;
                
                if (assigned > stockGeneral) {
                    input.setCustomValidity(`Stock insuficiente. Solo hay ${stockGeneral.toFixed(0)} en stock.`);
                    if (feedback) feedback.textContent = `Stock insuficiente. Solo hay ${stockGeneral.toFixed(0)} en stock.`;
                    input.classList.add('is-invalid');
                    validationError = true;
                } else {
                    input.setCustomValidity('');
                    input.classList.remove('is-invalid');
                    
                    // 1. Sumar al stock del equipo
                    asignacionUpdates[m.id] = firebase.firestore.FieldValue.increment(assigned);
                    // 2. Descontar del stock general
                    stockGeneralUpdates[m.id] = firebase.firestore.FieldValue.increment(-assigned);
                    // 3. Registrar para movimientos
                    movements.push({ materialId: m.id, quantity: assigned, notes: assignmentNotes, teamId: equipoId });
                    
                    hasUpdates = true;
                }
            } else {
                 input.setCustomValidity('');
            }
        });
        
        if (validationError) {
            this.showError('Revisa los campos con error: Stock general insuficiente.', 'Validación Fallida');
            return;
        }

        if (!hasUpdates) {
            this.showSuccess('No se ingresó ninguna cantidad positiva para asignar.', 'Sin Cambios');
            return;
        }

        const batch = db.batch(); 
        const equipoRef = db.collection('stockEquipos').doc(`equipo_${equipoId}`);
        const stockGeneralRef = db.collection('stockGeneral').doc('general');

        batch.set(equipoRef, asignacionUpdates, { merge: true }); // Usamos SET con merge para crear el documento si no existe
        batch.update(stockGeneralRef, stockGeneralUpdates); // Usamos UPDATE ya que 'general' siempre debería existir

        try {
            await batch.commit();

            // Registrar movimientos DEPUÉS de la actualización exitosa
            for (const mov of movements) {
                await this.registerStockMovement('ASIGNACION', mov.materialId, mov.quantity, mov.notes, mov.teamId);
            }

            this.showSuccess(`Materiales asignados al Equipo ${equipoId} y descontados del Stock General. 🚚`, 'Asignación Exitosa');
            form.reset();
            form.classList.remove('was-validated');
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalAsignarMaterial'));
            modal.hide();
        } catch (err) {
            console.error('Error al asignar material y descontar stock:', err);
             this.showError('Error al asignar material. Revisa la consola.', 'Fallo en la Operación');
        }
    }


    // =================================================================
    // =========== UTILIDADES (SweetAlert2) ============================
    // =================================================================

    showSuccess(message, title = 'Éxito') {
        Swal.fire({
            icon: 'success',
            title: title,
            text: message,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
        });
    }

    showError(message, title = 'Error') {
        Swal.fire({
            icon: 'error',
            title: title,
            text: message,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 5000,
            timerProgressBar: true
        });
    }
}

window.addEventListener('DOMContentLoaded', ()=>{
    // Asegúrate de que SweetAlert2 esté cargado antes de inicializar StockManager
    if (typeof Swal === 'undefined') {
        console.error("SweetAlert2 no está cargado. Usando alertas nativas.");
        // Fallback a alertas nativas si Swal no existe (aunque se incluyó en el HTML)
        StockManager.prototype.showSuccess = function(message) { alert(`Éxito: ${message}`); };
        StockManager.prototype.showError = function(message) { alert(`Error: ${message}`); };
    }
    window.stockManager = new StockManager();
});