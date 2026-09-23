import { type Content, transaction as t, vendor } from "./types.ts";

// Fictional vendors with invented names, made up to be no real business. In
// the Spanish UI the provider is "el modelo", since "proveedor" is a vendor.
export const spanish: Content = {
	language: "es",
	locale: "es",
	copy: {
		skip: "Ir a la búsqueda",
		product: "justask demo",
		page: "Búsqueda",
		languageLabel: "Idioma",
		themeLabel: "Tema",
		themes: { system: "Auto", light: "Claro", dark: "Oscuro" },
		vendors: "Proveedores",
		boxLabel: "Buscar un proveedor",
		placeholder: "Describa el proveedor con sus palabras",
		suggestions: "Pruebe una solicitud",
		oneVendor: "Nombra un proveedor",
		ambiguous: "Podría ser uno de dos",
		nothing: "Nada que encontrar",
		empty: "Ningún proveedor corresponde a esa solicitud.",
		chooseHint: "Elija el proveedor para ver sus transacciones.",
		transactionsWith: (name) => `Transacciones con ${name}`,
		columns: {
			number: "Factura",
			date: "Fecha",
			amount: "Monto",
			status: "Estado",
		},
		statuses: { paid: "Pagada", open: "Pendiente", overdue: "Vencida" },
		panel: "Qué pasó",
		idle: "Escriba una solicitud o pruebe una de las sugerencias.",
		waiting: "Esperando la respuesta",
		filled: "Completado",
		held: "Retenido",
		failed: "Falló",
		filledBecause: (name, none, several, gate) =>
			`Ganó ${name}, y none (${none}) y several (${several}) quedaron por debajo del umbral (${gate}).`,
		heldBecause: (reason) => {
			switch (reason.kind) {
				case "none-reached-gate":
					return `none (${reason.none}) alcanzó el umbral (${reason.gate}), así que no se muestra nada.`;
				case "several-reached-gate":
					return `several (${reason.several}) alcanzó el umbral (${reason.gate}), así que no se muestra nada.`;
				case "none-picked":
					return `El modelo eligió none (${reason.none}), así que no se muestra nada.`;
				case "several-picked":
					return `El modelo eligió several (${reason.several}), así que no se muestra nada.`;
				case "tie":
					return "Dos candidatos empataron en el primer lugar, así que no se muestra nada.";
				case "no-candidates":
					return "La lista corta no encontró candidatos, así que no se consultó al modelo.";
				case "provider":
					return "El modelo falló, así que no se muestra nada. El registro del servidor tiene los detalles.";
				case "timeout":
					return `El modelo no respondió en ${reason.timeoutMs} ms, así que no se muestra nada.`;
				case "unreachable":
					return `No se pudo contactar al servidor de búsqueda: ${reason.message}`;
			}
		},
		request: "Solicitud",
		candidate: "Candidato",
		probability: "Probabilidad",
		pick: "elegido",
		gate: "Umbral sobre none y several",
		shortlistLabel: "Lista corta",
		shortlist: (count, catalog) => `${count} de ${catalog} proveedores`,
		roundTrip: "Ida y vuelta",
	},
	vendors: [
		vendor(
			"tintaverde",
			"Papelería Tintaverde",
			"papel, tóner y artículos de oficina",
		),
		vendor(
			"cazuela",
			"Banquetes Cazuela Azul",
			"catering y almuerzos para la oficina",
		),
		vendor(
			"nubalia",
			"Nubalia Hosting",
			"alojamiento de páginas web y servidores en la nube",
		),
		vendor("brisamar", "Limpiezas Brisamar", "limpieza nocturna de oficinas"),
		vendor(
			"relucir",
			"Relucir Servicios de Limpieza",
			"limpieza de oficinas y de ventanas",
		),
		vendor(
			"letranueva",
			"Imprenta Letranueva",
			"tarjetas de presentación, volantes y letreros",
		),
		vendor(
			"rumboclaro",
			"Viajes Rumbo Claro",
			"vuelos y hoteles para viajes de trabajo",
		),
		vendor("cuentia", "Cuentia Software", "licencias de software contable"),
		vendor(
			"cafetal",
			"Café del Cafetal Alto",
			"café en grano y alquiler de cafeteras",
		),
		vendor("pieveloz", "Mensajería Pieveloz", "mensajería el mismo día"),
		vendor(
			"lindero",
			"Bufete Lindero",
			"revisión de contratos y asesoría legal",
		),
		vendor(
			"tecnoria",
			"Tecnoria Soporte",
			"reparación de computadoras y soporte técnico",
		),
		vendor("serena", "Nómina Serena", "nómina y recursos humanos"),
		vendor("coberplena", "Seguros Cobertura Plena", "seguros para empresas"),
	],
	transactions: [
		t("tintaverde", "FAC-2041", "2026-09-14", 412.5, "open"),
		t("tintaverde", "FAC-1987", "2026-08-12", 389.2, "paid"),
		t("tintaverde", "FAC-1902", "2026-07-10", 455.0, "paid"),
		t("cazuela", "FAC-2055", "2026-09-18", 1240.0, "open"),
		t("cazuela", "FAC-2012", "2026-08-28", 960.0, "paid"),
		t("cazuela", "FAC-1931", "2026-07-25", 1105.75, "paid"),
		t("nubalia", "FAC-2030", "2026-09-01", 299.0, "paid"),
		t("nubalia", "FAC-1960", "2026-08-01", 299.0, "paid"),
		t("brisamar", "FAC-2048", "2026-09-15", 1800.0, "open"),
		t("brisamar", "FAC-1975", "2026-08-15", 1800.0, "overdue"),
		t("relucir", "FAC-2033", "2026-09-05", 640.0, "paid"),
		t("relucir", "FAC-1950", "2026-08-05", 640.0, "paid"),
		t("letranueva", "FAC-2019", "2026-08-30", 185.4, "paid"),
		t("rumboclaro", "FAC-2051", "2026-09-17", 2360.9, "open"),
		t("rumboclaro", "FAC-1911", "2026-07-14", 1720.0, "paid"),
		t("cuentia", "FAC-2002", "2026-08-20", 1188.0, "paid"),
		t("cafetal", "FAC-2044", "2026-09-10", 96.3, "open"),
		t("cafetal", "FAC-1983", "2026-08-10", 112.8, "paid"),
		t("pieveloz", "FAC-2038", "2026-09-08", 74.0, "overdue"),
		t("pieveloz", "FAC-1994", "2026-08-18", 58.5, "paid"),
		t("lindero", "FAC-2027", "2026-09-03", 3400.0, "open"),
		t("tecnoria", "FAC-2009", "2026-08-24", 265.0, "paid"),
		t("tecnoria", "FAC-1920", "2026-07-19", 540.0, "paid"),
		t("serena", "FAC-2036", "2026-09-06", 820.0, "paid"),
		t("coberplena", "FAC-1899", "2026-07-01", 2940.0, "paid"),
	],
	suggestions: {
		oneVendor: [
			"los del catering",
			"quién aloja nuestra página web",
			"el pedido de tóner",
			"cazuela asul",
			"honorarios por revisar el contrato de alquiler",
		],
		ambiguous: [
			"la empresa de limpieza",
			"la factura de Tintaverde o de Cazuela Azul",
		],
		nothing: ["el plomero que arregló la fuga", "¿cuánto debemos en total?"],
	},
};
