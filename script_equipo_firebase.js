// ====== Configuración Firebase ======
const firebaseConfig = {
    apiKey: "AIzaSyA6D0F9Ex3K7h2__PlNaMiREkeaa1StVkc",
    authDomain: "ordenes-instalacion.firebaseapp.com",
    projectId: "ordenes-instalacion",
    storageBucket: "ordenes-instalacion.firebasestorage.app",
    messagingSenderId: "424944239546",
    appId: "1:424944239546:web:b6c783855ae4f3b0799383",
    measurementId: "G-B2K0XR5D5K"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d) ? null : d;
}

class EquipoPanel {
    constructor() {
        this.equipoId = localStorage.getItem('equipoId');
        this.unsubscribe = null;
        this.checkLogin();
        this.init();
    }

    checkLogin() {
        const userType = localStorage.getItem('userType');
        const equipoId = localStorage.getItem('equipoId');
        if (userType !== 'equipo' || !equipoId) {
            window.location.href = 'login.html';
        } else {
            document.getElementById('userDisplay').textContent = `Equipo ${equipoId}`;
        }
    }

    init() {
        document.getElementById('logoutBtn').addEventListener('click', this.logout);
        this.loadTeamOrdersRealtime();
    }

    logout() {
        localStorage.removeItem('userType');
        localStorage.removeItem('equipoId');
        window.location.href = 'login.html';
    }

    loadTeamOrdersRealtime() {
        const container = document.getElementById('teamOrdersContainer');
        if (!container) return;
        
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        
        const q = db.collection('ordenes')
                    .where('estado', '==', 'pendiente')
                    .where('instalacion.equipo', '==', this.equipoId);

        this.unsubscribe = q.onSnapshot(snapshot => {
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            docs.sort((a,b) => {
                const da = toDate(a.instalacion?.fecha) || new Date(0);
                const db_ = toDate(b.instalacion?.fecha) || new Date(0);
                return da - db_;
            });
            if (!docs.length) {
                container.innerHTML = `<div class="col-12 text-center text-muted py-5"><i class="fas fa-folder-open fa-3x mb-3"></i><h5>No tienes órdenes asignadas</h5></div>`;
            } else {
                container.innerHTML = docs.map(o => this.createOrderCard(o)).join('');
            }
        }, err => {
            console.error('Error listener equipo:', err);
            container.innerHTML = `<div class="col-12 text-danger">Error cargando órdenes. Ver consola.</div>`;
        });
    }

    createOrderCard(order) {
        const fechaInst = toDate(order.instalacion?.fecha);
        const fechaTxt = fechaInst ? fechaInst.toLocaleString('es-ES') : '-';
        const tipo = order.tipo || 'otros';

        const colors = {
            'Instalacion': 'bg-primary',
            'Mudanza': 'bg-warning text-dark',
            'Reconversion': 'bg-purple',
            'Extension': 'bg-success',
            'Presupuesto': 'bg-secondary',
            'otros': 'bg-danger'
        };
        const headerClass = colors[tipo] || 'bg-secondary';

        const ubicacionLink = order.domicilio?.ubicacion ? `<a href="${order.domicilio.ubicacion}" target="_blank">Ver en Maps</a>` : '-';
        return `
            <div class="col-md-6 col-lg-4">
                <div class="card order-card mb-3">
                    <div class="card-header ${headerClass} d-flex justify-content-between align-items-center">
                        <span>Orden #${order.id.substr(-6)}</span>
                        <span class="badge bg-light text-dark">${tipo}</span>
                    </div>
                    <div class="card-body">
                        <h6 class="card-title text-primary">${order.cliente?.nombre || '-'}</h6>
                        <p class="small text-muted mb-1">Creada por: <strong>${order.creadoPor || '-'}</strong></p>
                        <p class="small mb-1"><i class="fas fa-id-card me-2"></i>DNI: ${order.cliente?.dni || '-'}</p>
                        <p class="small mb-1"><strong>N° Cliente:</strong> ${order.cliente?.numeroCliente || '-'}</p>
                        <p class="small mb-1"><i class="fas fa-envelope me-2"></i>Email: ${order.cliente?.email || '-'}</p>
                        <p class="small mb-1"><i class="fas fa-phone me-2"></i>Teléfono: ${order.cliente?.telefono || '-'}</p>
                        <p class="small mb-1"><i class="fas fa-map-marker-alt me-2"></i>${order.domicilio?.direccion || '-'} ${order.domicilio?.numero || ''}</p>
                        <p class="small mb-1"><strong>Ubicación:</strong> ${ubicacionLink}</p>
                        <p class="small mb-1"><strong>Zona:</strong> ${order.domicilio?.zona || '-'}</p>
                        <p class="small mb-1"><strong>Plan:</strong> ${order.instalacion?.plan || '-'}</p>
                        <p class="small mb-1"><strong>Instalar:</strong> ${fechaTxt}</p>
                        <p class="small mb-1"><strong>Descripción:</strong> ${order.descripcion || '-'}</p>
                        <button class="btn btn-success btn-sm mt-2" onclick="teamPanel.markCompleted('${order.id}')"><i class="fas fa-check me-1"></i>Marcar como Completada</button>
                    </div>
                </div>
            </div>
        `;
    }

    async markCompleted(id) {
        try {
            await db.collection('ordenes').doc(id).update({
                estado: 'completado',
                fechaCompletado: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch(err) {
            console.error('Error marcando completada (equipo):', err);
            alert('Error marcando completada. Revisa consola.');
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.teamPanel = new EquipoPanel();
});
