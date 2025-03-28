const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();

// Middleware CORS
app.use(cors({
    origin: '*', // Temporalmente permite todos los orígenes
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Middleware para JSON
app.use(express.json());
app.use(express.static(__dirname + '/public'));

// Configuración de la conexión MySQL
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Sarazua_2024.:)',
    database: 'examen_Laboratorio'
});

// Verificar la conexión
pool.getConnection()
  .then(connection => {
    console.log('✅ Conexión a MySQL establecida');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Error de conexión:', err);
  });

// Función de manejo de errores
function handleError(res, error, message = 'Error en el servidor') {
    console.error(error);
    res.status(500).json({
        success: false,
        error: message,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
}

// Middleware para validar parámetro "grado_id" y "fecha"
function validateGradoFecha(req, res, next) {
    const { grado_id, fecha } = req.query;
    if (!grado_id || !fecha) {
        return res.status(400).json({
            success: false,
            error: "Los parámetros grado_id y fecha son requeridos"
        });
    }
    next();
}

// Ruta de registro
app.post('/registro', async (req, res) => {
    const { nombre, apellido, correo, contrasena } = req.body;
    if (!nombre || !apellido || !correo || !contrasena) {
        return res.status(400).json({ success: false, error: "Todos los campos son obligatorios" });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO profesores (Nombre, Apellido, Correo, contrasena) VALUES (?, ?, ?, ?)',
            [nombre, apellido, correo, contrasena]
        );
        res.json({
            success: true,
            mensaje: "Usuario registrado",
            id: result.insertId
        });
    } catch (err) {
        handleError(res, err, "Error al registrar usuario");
    }
});

// Ruta de login
app.post('/login', async (req, res) => {
    const { usuario, contrasena } = req.body;
    if (!usuario || !contrasena) {
        return res.status(400).json({ success: false, error: "Usuario y contraseña son requeridos" });
    }

    try {
        const [profesores] = await pool.query(
            'SELECT id, Nombre, Apellido, Correo FROM profesores WHERE Correo = ? AND contrasena = ?',
            [usuario, contrasena]
        );

        if (profesores.length === 0) {
            return res.status(401).json({ success: false, error: "Credenciales incorrectas" });
        }

        const profesor = profesores[0];
        res.json({
            success: true,
            profesor: {
                id: profesor.id,
                nombre: profesor.Nombre,
                apellido: profesor.Apellido,
                email: profesor.Correo
            },
            mensaje: "Inicio de sesión exitoso"
        });
    } catch (err) {
        handleError(res, err, "Error en el login");
    }
});

// Agrega esta ruta antes de iniciar el servidor
app.get('/grados', async (req, res) => {
    try {
        const [grados] = await pool.query('SELECT id, Nombre_Grado FROM grados');
        res.json({ 
            success: true, 
            grados 
        });
    } catch (err) {
        handleError(res, err, "Error al obtener los grados");
    }
});

// Ruta para obtener un grado específico
app.get('/grados/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, Nombre_Grado FROM grados WHERE id = ?', 
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: "Grado no encontrado" });
        }
        
        res.json({ 
            success: true,
            grado: {
                id: rows[0].id,
                Nombre_Grado: rows[0].Nombre_Grado
            }
        });
    } catch (err) {
        console.error("Error en /grados/:id:", err);
        res.status(500).json({ 
            success: false,
            error: "Error al obtener el grado",
            details: err.message
        });
    }
});

// Ruta para obtener alumnos con asistencia
app.get('/alumnos-asistencia', async (req, res) => {
    const { grado_id, fecha } = req.query;

    if (!grado_id || !fecha) {
        return res.status(400).json({ 
            success: false,
            error: "Los parámetros grado_id y fecha son requeridos"
        });
    }

    try {
        // Verificar que el grado existe
        const [grado] = await pool.query(
            'SELECT Nombre_Grado FROM grados WHERE id = ?',
            [grado_id]
        );
        
        if (grado.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: "El grado especificado no existe"
            });
        }

        // Obtener alumnos con estado de asistencia
        const [alumnos] = await pool.query(
            `SELECT 
                a.id,
                a.ID_Alumno,
                a.Nombre,
                a.Apellido,
                IFNULL(asi.Estado, 'Ausente') AS Estado
             FROM alumnos a
             LEFT JOIN asistencia asi ON a.ID_Alumno = asi.ID_Alumno AND asi.Fecha = ?
             WHERE a.ID_Grado = ?
             ORDER BY a.Apellido, a.Nombre`,
            [fecha, grado_id]
        );

        res.json({
            success: true,
            grado: grado[0].Nombre_Grado,
            fecha: fecha,
            alumnos: alumnos
        });
    } catch (err) {
        console.error("Error en /alumnos-asistencia:", err);
        res.status(500).json({ 
            success: false,
            error: "Error al obtener alumnos",
            details: err.message
        });
    }
});

app.get('/alumnos', async (req, res) => {
    const { grado_id, fecha } = req.query;

    if (!grado_id) {
        return res.status(400).json({
            success: false,
            error: "El parámetro grado_id es requerido"
        });
    }

    try {
        const fechaAsistencia = fecha || new Date().toISOString().split('T')[0];
        
        // 1. Obtener información del grado
        const [grados] = await pool.query(
            'SELECT id, Nombre_Grado FROM grados WHERE id = ?',
            [grado_id]
        );
        
        if (grados.length === 0) {
            return res.status(404).json({
                success: false,
                error: "El grado especificado no existe"
            });
        }

        // 2. Obtener alumnos con su estado de asistencia
        const [alumnos] = await pool.query(
            `SELECT 
                a.id, 
                a.ID_Alumno, 
                a.Nombre, 
                a.Apellido,
                IFNULL(asist.Estado, 'Ausente') AS Estado
             FROM alumnos a
             LEFT JOIN asistencia asist ON a.ID_Alumno = asist.ID_Alumno 
                AND asist.Fecha = ?
             WHERE a.ID_Grado = ?
             ORDER BY a.Apellido ASC, a.Nombre ASC`,
            [fechaAsistencia, grado_id]
        );

        res.json({
            success: true,
            grado: grados[0].Nombre_Grado,
            fecha: fechaAsistencia,
            alumnos: alumnos
        });
    } catch (err) {
        console.error("Error al obtener alumnos:", err);
        res.status(500).json({
            success: false,
            error: "Error al obtener alumnos",
            details: err.message
        });
    }
});

app.post('/asistencia', async (req, res) => {
    const { alumno_id, fecha, estado } = req.body;

    // Validaciones
    if (!alumno_id || isNaN(alumno_id)) {
        return res.status(400).json({ 
            success: false,
            error: "ID de alumno inválido" 
        });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        
        // Obtener ID_Alumno correspondiente
        const [alumno] = await connection.query(
            'SELECT ID_Alumno FROM alumnos WHERE id = ?',
            [alumno_id]
        );

        if (alumno.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: "Alumno no encontrado" 
            });
        }

        const idAlumno = alumno[0].ID_Alumno;

        // Insertar asistencia (sin mencionar ID_Asistencia)
        const [result] = await connection.query(
            `INSERT INTO asistencia (ID_Alumno, Fecha, Estado)
             VALUES (?, ?, ?)`,
            [idAlumno, fecha, estado]
        );

        res.json({ 
            success: true,
            message: "Asistencia registrada correctamente",
            data: {
                insertId: result.insertId
            }
        });

    } catch (err) {
        console.error("Error en la base de datos:", {
            message: err.message,
            code: err.code,
            sqlMessage: err.sqlMessage,
            sql: err.sql
        });
        
        res.status(500).json({ 
            success: false,
            error: "Error en el servidor",
            details: process.env.NODE_ENV === 'development' ? {
                code: err.code,
                sqlMessage: err.sqlMessage
            } : undefined
        });
    } finally {
        if (connection) connection.release();
    }
});

// Iniciar el servidor
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
