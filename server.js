const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();

app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500'
    ],
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Middleware para analizar JSON
app.use(express.json());

// Configuración de la conexión a MySQL
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Sarazua_2024.:)',
    database: 'examen_Laboratorio'
});

// Verifica primero la conexión a la base de datos
pool.getConnection()
  .then(connection => {
    console.log('✅ Conexión a MySQL establecida correctamente');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Error al conectar a MySQL:', err);
  });


  //CONSULTA DE REGISTRO
app.post('/registro', async (req, res) => {
    const { nombre, apellido, correo, contrasena } = req.body;

    if (!nombre || !apellido || !correo || !contrasena) {
        return res.status(400).json({ 
            success: false,
            error: "Todos los campos son obligatorios" 
        });
    }

    try {
        // Consulta SQL modificada para omitir ID_Profesor si no es necesario
        const [result] = await pool.query(
            'INSERT INTO profesores (Nombre, Apellido, Correo, contrasena) VALUES (?, ?, ?, ?)',
            [nombre, apellido, correo, contrasena]
        );

        res.json({ 
            success: true,
            mensaje: "Usuario registrado exitosamente",
            id: result.insertId
        });
    } catch (err) {
        console.error("❌ Error al registrar:", err);
        
        let mensajeError = "Error al registrar usuario";
        if (err.code === 'ER_DUP_ENTRY') {
            mensajeError = "El correo electrónico ya está registrado";
        } else if (err.code === 'ER_NO_DEFAULT_FOR_FIELD') {
            mensajeError = "Problema con la estructura de la base de datos";
        }

        res.status(500).json({ 
            success: false,
            error: mensajeError,
            details: err.sqlMessage || err.message
        });
    }
});


// CONSULTA DE LOGIN
app.post('/login', async (req, res) => {
    const { usuario, contrasena } = req.body;

    if (!usuario || !contrasena) {
        return res.status(400).json({ 
            success: false,
            error: "Usuario y contraseña son requeridos" 
        });
    }

    try {
        const [profesores] = await pool.query(
            'SELECT id, Nombre, Apellido, Correo FROM profesores WHERE Correo = ? AND contrasena = ?',
            [usuario, contrasena]
        );

        if (profesores.length === 0) {
            return res.status(401).json({ 
                success: false,
                error: "Credenciales incorrectas" 
            });
        }

        const profesor = profesores[0];
        
        // Asegúrate de enviar una respuesta JSON válida
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({
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
        console.error("❌ Error en login:", err);
        // Asegúrate de enviar una respuesta JSON incluso en errores
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ 
            success: false,
            error: "Error en el servidor",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});     


//CONSULTA DE GRADOS DE IMPRESION
app.get('/grados', async (req, res) => {
    try {
        const [grados] = await pool.query(
            'SELECT id, Nombre_Grado FROM grados ORDER BY Nombre_Grado' // Corregido el nombre de la tabla
        );
        
        res.json({
            success: true,
            grados
        });
    } catch (err) {
        console.error("Error al obtener grados:", err);
        res.status(500).json({
            success: false,
            error: "Error al consultar la base de datos"
        });
    }
});


//CONSULTA DE ALUMNOS
app.get('/alumnos', async (req, res) => {
    const { grado_id, fecha } = req.query; // Añadir fecha como parámetro requerido

    if (!grado_id || !fecha) {
        return res.status(400).json({ 
            success: false,
            error: "Los parámetros grado_id y fecha son requeridos"
        });
    }

    try {
        // Verificar si el grado existe
        const [grados] = await pool.query('SELECT id, Nombre_Grado FROM grados WHERE id = ?', [grado_id]);
        
        if (grados.length === 0) {
            return res.status(404).json({
                success: false,
                error: "El grado especificado no existe"
            });
        }

        // Obtener alumnos con información de asistencia
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
            [fecha, grado_id]
        );

        res.json({
            success: true,
            grado: grados[0].Nombre_Grado,
            fecha: fecha,
            alumnos: alumnos
        });
    } catch (err) {
        console.error("Error al obtener alumnos:", err);
        res.status(500).json({ 
            success: false,
            error: "Error al obtener alumnos",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

//CONSULTA DE ASISTENCIAS

app.post('/asistencia', async (req, res) => {
    const { alumno_id, fecha, estado } = req.body;

    // Validaciones adicionales
    if (!alumno_id || !fecha || !estado) {
        return res.status(400).json({ 
            success: false,
            error: "Todos los campos son obligatorios" 
        });
    }

    // Validar que el estado sea correcto
    const estadosValidos = ['Presente', 'Ausente'];
    if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ 
            success: false,
            error: "Estado de asistencia inválido" 
        });
    }

    try {
        // Verificar si el alumno existe
        const [alumnos] = await pool.query('SELECT id FROM alumnos WHERE ID_Alumno = ?', [alumno_id]);
        if (alumnos.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: "El alumno especificado no existe" 
            });
        }

        // Verificar si ya existe registro para esta fecha
        const [existente] = await pool.query(
            `SELECT id FROM asistencia 
             WHERE ID_Alumno = ? AND Fecha = ?`,
            [alumno_id, fecha]
        );

        if (existente.length > 0) {
            // Actualizar registro existente
            await pool.query(
                `UPDATE asistencia 
                 SET Estado = ? 
                 WHERE id = ?`,
                [estado, existente[0].id]
            );
        } else {
            // Insertar nuevo registro
            await pool.query(
                `INSERT INTO asistencia 
                 (ID_Alumno, Fecha, Estado) 
                 VALUES (?, ?, ?)`,
                [alumno_id, fecha, estado]
            );
        }

        res.json({
            success: true,
            message: "Asistencia registrada correctamente"
        });
    } catch (err) {
        console.error("Error al registrar asistencia:", err);
        res.status(500).json({ 
            success: false,
            error: "Error al registrar asistencia",
            details: err.sqlMessage 
        });
    }
});

// Endpoint para obtener alumnos con asistencia por grado y fecha
app.get('/alumnos-asistencia', async (req, res) => {
    const { grado_id, fecha } = req.query;

    if (!grado_id || !fecha) {
        return res.status(400).json({ 
            success: false,
            error: "Se requieren grado_id y fecha" 
        });
    }

    try {
        // Verificar si el grado existe
        const [grados] = await pool.query(
            'SELECT id, Nombre_Grado FROM grados WHERE id = ?', 
            [grado_id]
        );

        if (grados.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Grado no encontrado"
            });
        }

        // Obtener alumnos con estado de asistencia
        const [alumnos] = await pool.query(
            `SELECT 
                a.id,
                a.ID_Alumno,
                a.Nombre,
                a.Apellido,
                IFNULL(asist.Estado, 'Ausente') AS Estado
             FROM alumnos a
             LEFT JOIN asistencia asist ON a.ID_Alumno = asist.ID_Alumno AND asist.Fecha = ?
             WHERE a.ID_Grado = ?
             ORDER BY a.Apellido, a.Nombre`,
            [fecha, grado_id]
        );

        res.json({
            success: true,
            grado: grados[0].Nombre_Grado,
            fecha: fecha,
            alumnos: alumnos
        });

    } catch (error) {
        console.error("Error en /alumnos-asistencia:", error);
        res.status(500).json({
            success: false,
            error: "Error al obtener alumnos",
            details: error.message
        });
    }
});

// Endpoint para registrar/actualizar asistencia
app.post('/registrar-asistencia', async (req, res) => {
    const { alumno_id, fecha, estado } = req.body;

    // Validaciones
    if (!alumno_id || !fecha || !estado) {
        return res.status(400).json({
            success: false,
            error: "Todos los campos son obligatorios"
        });
    }

    if (!['Presente', 'Ausente'].includes(estado)) {
        return res.status(400).json({
            success: false,
            error: "Estado de asistencia inválido"
        });
    }

    try {
        // Verificar si el alumno existe
        const [alumnos] = await pool.query(
            'SELECT id FROM alumnos WHERE ID_Alumno = ?',
            [alumno_id]
        );

        if (alumnos.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Alumno no encontrado"
            });
        }

        // Verificar si ya existe registro
        const [registros] = await pool.query(
            'SELECT id FROM asistencia WHERE ID_Alumno = ? AND Fecha = ?',
            [alumno_id, fecha]
        );

        if (registros.length > 0) {
            // Actualizar registro existente
            await pool.query(
                'UPDATE asistencia SET Estado = ? WHERE id = ?',
                [estado, registros[0].id]
            );
        } else {
            // Crear nuevo registro
            await pool.query(
                'INSERT INTO asistencia (ID_Alumno, Fecha, Estado) VALUES (?, ?, ?)',
                [alumno_id, fecha, estado]
            );
        }

        res.json({
            success: true,
            message: "Asistencia registrada correctamente"
        });

    } catch (error) {
        console.error("Error en /registrar-asistencia:", error);
        res.status(500).json({
            success: false,
            error: "Error al registrar asistencia",
            details: error.message
        });
    }
});

// En tu server.js (backend)
app.get('/alumnos-por-grado', async (req, res) => {
    const { grado_id } = req.query;

    if (!grado_id) {
        return res.status(400).json({ 
            success: false,
            error: "El parámetro grado_id es requerido" 
        });
    }

    try {
        // Verificar si el grado existe
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

        // Obtener alumnos del grado
        const [alumnos] = await pool.query(
            `SELECT 
                id,
                ID_Alumno,
                Nombre,
                Apellido
             FROM alumnos 
             WHERE ID_Grado = ?
             ORDER BY Apellido ASC, Nombre ASC`,
            [grado_id]
        );

        res.json({
            success: true,
            grado: grados[0].Nombre_Grado,
            alumnos: alumnos
        });

    } catch (error) {
        console.error("Error al obtener alumnos:", error);
        res.status(500).json({ 
            success: false,
            error: "Error al obtener alumnos",
            details: error.message
        });
    }
});

// Iniciar servidor
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});