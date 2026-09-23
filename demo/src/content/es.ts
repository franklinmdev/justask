import {
	type Content,
	type FieldHeldReason,
	status,
	transaction as t,
	tag,
	vendor,
} from "./types.ts";

/** Why a filter or card field is held, as both panels say it. */
function fieldHeldBecause(reason: FieldHeldReason): string {
	switch (reason.kind) {
		case "no-candidates":
			return "El código no encontró candidatos, así que no se consultó al modelo.";
		case "unresolved-currency":
			return `La solicitud nombra “${reason.mark}”, que no es la moneda local, así que el código retuvo el campo sin consultar al modelo.`;
		case "failed":
			return "No llegó respuesta, así que el campo queda retenido.";
		case "tie":
			return "Dos etiquetas empataron en el primer lugar, así que el campo queda retenido.";
		case "not-mentioned":
			return "El modelo dice que la solicitud no lo menciona.";
		case "not-available":
			return "El modelo dice que la solicitud pide algo que ningún candidato expresa.";
		case "below-gate":
			return `Una elección (${reason.probability}) quedó por debajo del umbral (${reason.gate}), así que el campo queda retenido.`;
		case "conflict":
			return "Las elecciones no forman un solo filtro, así que el código retuvo el campo.";
	}
}

// Fictional vendors with invented names, made up to be no real business. In
// the Spanish UI the provider is "el modelo", since "proveedor" is a vendor.
export const spanish: Content = {
	language: "es",
	locale: "es",
	copy: {
		skip: "Ir al contenido",
		product: "justask demo",
		casesLabel: "Casos",
		cases: { table: "Tabla", form: "Formulario", search: "Búsqueda" },
		hood: "Bajo el capó",
		hoodViews: "Vistas",
		trace: "Traza",
		json: "JSON",
		code: "Código",
		strip: "Esta llamada",
		stripIdle:
			"La latencia, los tokens y el costo aparecen después de la primera llamada.",
		notReported: "No informado",
		jsonIdle: "El resultado aparece aquí después de la primera llamada.",
		showLabel: "Mostrar",
		app: "Aplicación",
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
		latency: "Latencia",
		inputTokens: "Tokens de entrada",
		cost: "Costo",
		recorded: (date) => `Ejecución grabada · ${date}`,
		replaying: (date, request) =>
			`Reproduciendo una ejecución grabada del ${date}: “${request}”`,
		saved: ({ clicks, menus }) => {
			const words = `1 frase frente a ${clicks} ${clicks === 1 ? "clic" : "clics"}`;
			return menus === 0
				? words
				: `${words} en ${menus} ${menus === 1 ? "menú" : "menús"}`;
		},
		filter: {
			transactions: "Transacciones",
			boxLabel: "Filtrar las transacciones",
			placeholder: "Describa las transacciones que quiere ver",
			proposed: "Filtros por aplicar",
			fields: {
				vendor: "Proveedor",
				status: "Estado",
				date: "Fecha",
				amount: "Monto",
			},
			remove: "Quitar",
			removeLabel: (field) => `Quitar el filtro de ${field.toLowerCase()}`,
			removed: (field) => `Se quitó: ${field.toLowerCase()}`,
			confirm: "Aplicar filtros",
			empty: "Nada en esa solicitud filtra las transacciones.",
			applied: "Aplicados",
			appliedFields: (set, held) =>
				[
					set.length > 0 &&
						`Aplicados: ${set.map(([field, value]) => `${field}, ${value}`).join("; ")}.`,
					held.length > 0 &&
						`${held.length === 1 ? "Campo retenido" : "Campos retenidos"}: ${held.join(", ")}.`,
				]
					.filter(Boolean)
					.join(" "),
			clear: "Quitar filtros",
			showing: (count, total) =>
				count === total
					? `Las ${total} transacciones`
					: `${count} de ${total} transacciones`,
			controls: {
				allVendors: "Todos",
				allStatuses: "Todos",
				from: "Fecha de inicio",
				to: "Fecha de fin",
				fromEmpty: "Inicio",
				toEmpty: "Fin",
				min: "Monto mínimo",
				max: "Monto máximo",
				minEmpty: "Mín.",
				maxEmpty: "Máx.",
				calendar: {
					label: "Elija el día",
					previous: "Mes anterior",
					next: "Mes siguiente",
					clear: "Borrar",
				},
			},
			none: "Ninguna transacción cumple los filtros aplicados.",
			vendorColumn: "Proveedor",
			fills: "Completa los filtros",
			holds: "Deja uno vacío",
			nothing: "Nada que filtrar",
			dateRange: ({ from, to }, date) => {
				if (from && to) {
					return from === to
						? `el ${date(from)}`
						: `del ${date(from)} al ${date(to)}`;
				}
				return from ? `desde el ${date(from)}` : `hasta el ${date(to ?? "")}`;
			},
			amountRange: ({ min, max, exact, currency }, amount) => {
				const money = (value: number) => amount(value, currency);
				if (exact !== undefined) return `exactamente ${money(exact)}`;
				if (min !== undefined && max !== undefined) {
					return `de ${money(min)} a ${money(max)}`;
				}
				return min !== undefined
					? `${money(min)} o más`
					: `${money(max ?? 0)} o menos`;
			},
			summary: (filled, total) =>
				filled === 0
					? `Ningún campo completado, los ${total} retenidos.`
					: filled === total
						? `Los ${total} campos completados.`
						: `${filled} de ${total} campos completados, el resto retenido.`,
			filledBecause: (probability, gate) =>
				`Cada elección superó el umbral: la más baja fue ${probability}, el umbral ${gate}.`,
			heldBecause: fieldHeldBecause,
			start: "Dónde empieza",
			end: "Dónde termina",
			number: (text) => `Qué hace “${text}”`,
			roles: { min: "el mínimo", max: "el máximo", exact: "el monto exacto" },
			more: (count) => `${count} candidatos más, sin mostrar`,
			gate: "Umbral",
			questions: "Preguntas en una llamada",
		},
		card: {
			title: "Nuevo gasto",
			boxLabel: "Describa el gasto",
			placeholder: "Describa el gasto con sus palabras",
			fields: {
				vendor: "Proveedor",
				tags: "Etiquetas",
				spent_on: "Día",
				total: "Monto",
			},
			tags: {
				meals: "Comidas",
				travel: "Viajes",
				office: "Oficina",
				client: "Cliente",
			},
			chooseVendor: "Elija un proveedor",
			fromRequest: "de la solicitud",
			announce: (filled, waiting) => {
				const list = (names: string[]) =>
					new Intl.ListFormat("es").format(
						names.map((name) => name.toLowerCase()),
					);
				if (filled.length === 0) {
					return `Nada completado. Por completar: ${list(waiting)}.`;
				}
				return waiting.length === 0
					? `Completado: ${list(filled)}. Nada por completar.`
					: `Completado: ${list(filled)}. Por completar: ${list(waiting)}.`;
			},
			unanswered:
				"No se pudo leer la solicitud, así que la tarjeta queda como estaba. Complétela a mano.",
			pickDay: "Elija un día",
			calendar: {
				label: "Elija el día",
				previous: "Mes anterior",
				next: "Mes siguiente",
				clear: "Borrar",
			},
			confirm: "Guardar gasto",
			saved: "Gasto guardado.",
			undo: "Deshacer",
			expenses: "Gastos guardados",
			noExpenses:
				"Aún no hay gastos guardados. Los guardados quedan en memoria hasta que se recargue la página.",
			fills: "Completa la tarjeta",
			holds: "Deja uno vacío",
			nothing: "No es un gasto nuevo",
			intent: "¿Gasto nuevo?",
			intentLabels: {
				new_record: "registra un gasto nuevo",
				not_mentioned: "no pide ningún registro",
				not_available: "cambia, borra, envía o pregunta por uno",
			},
			intentBecause: (reason) => {
				switch (reason.kind) {
					case "passed":
						return `La solicitud pide un gasto nuevo: new_record (${reason.probability}) superó el umbral (${reason.gate}).`;
					case "below-gate":
						return `new_record (${reason.probability}) quedó por debajo del umbral (${reason.gate}), así que todos los campos quedan retenidos.`;
					case "not-mentioned":
						return "El modelo dice que la solicitud no pide ningún registro, así que todos los campos quedan retenidos.";
					case "not-available":
						return "El modelo dice que la solicitud trata de un gasto pero no agrega ninguno, así que todos los campos quedan retenidos.";
					case "tie":
						return "Dos etiquetas empataron en el primer lugar, así que todos los campos quedan retenidos.";
					case "failed":
						return "No llegó respuesta, así que todos los campos quedan retenidos.";
					case "command":
						return `La solicitud actúa sobre un gasto ya registrado (“${reason.verb}”, “${reason.reference}”), así que el código retuvo todos los campos sin importar la elección.`;
				}
			},
			heldBecause: (reason) => {
				switch (reason.kind) {
					case "not-a-record":
						return "La solicitud no pide un gasto nuevo, así que el campo queda retenido con los demás.";
					case "pair":
						return `La solicitud nombra dos candidatos (“${reason.text}”), así que el código retuvo el campo sin importar la elección.`;
					case "foreign-currency":
						return `La elección nombra “${reason.mark}”, que no es la moneda local, así que el código retuvo el campo.`;
					case "ambiguous":
						return `“${reason.text}” se lee de dos maneras, así que el código retuvo el campo sin importar su probabilidad.`;
					case "period":
						return `“${reason.text}” es un período, no un día, así que el código retuvo el campo.`;
					default:
						return fieldHeldBecause(reason);
				}
			},
			tagQuestion: (name) => `¿Etiqueta ${name.toLowerCase()}?`,
			yes: "la solicitud lo pide",
			unresolved: (mark) => `“${mark}” no es la moneda local`,
			ambiguous: "se lee de dos maneras",
		},
	},
	vendors: [
		vendor(
			"tintaverde",
			"Papelería Tintaverde",
			"papel, tóner y artículos de oficina",
			"Tintaverde",
		),
		vendor(
			"cazuela",
			"Banquetes Cazuela Azul",
			"catering y almuerzos para la oficina",
			"Cazuela Azul",
		),
		vendor(
			"nubalia",
			"Nubalia Hosting",
			"alojamiento de páginas web y servidores en la nube",
			"Nubalia",
		),
		vendor(
			"brisamar",
			"Limpiezas Brisamar",
			"limpieza nocturna de oficinas",
			"Brisamar",
		),
		vendor(
			"relucir",
			"Relucir Servicios de Limpieza",
			"limpieza de oficinas y de ventanas",
			"Relucir",
		),
		vendor(
			"letranueva",
			"Imprenta Letranueva",
			"tarjetas de presentación, volantes y letreros",
			"Letranueva",
		),
		vendor(
			"rumboclaro",
			"Viajes Rumbo Claro",
			"vuelos y hoteles para viajes de trabajo",
			"Rumbo Claro",
		),
		vendor(
			"cuentia",
			"Cuentia Software",
			"licencias de software contable",
			"Cuentia",
		),
		vendor(
			"cafetal",
			"Café del Cafetal Alto",
			"café en grano y alquiler de cafeteras",
			"Cafetal",
		),
		vendor(
			"pieveloz",
			"Mensajería Pieveloz",
			"mensajería el mismo día",
			"Pieveloz",
		),
		vendor(
			"lindero",
			"Bufete Lindero",
			"revisión de contratos y asesoría legal",
			"Lindero",
		),
		vendor(
			"tecnoria",
			"Tecnoria Soporte",
			"reparación de computadoras y soporte técnico",
			"Tecnoria",
		),
		vendor("serena", "Nómina Serena", "nómina y recursos humanos", "Serena"),
		vendor(
			"coberplena",
			"Seguros Cobertura Plena",
			"seguros para empresas",
			"Cobertura Plena",
		),
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
	statuses: [
		status("paid", "facturas pagadas en su totalidad"),
		status("open", "facturas pendientes, sin pagar y aún sin vencer"),
		status(
			"overdue",
			"facturas vencidas, sin pagar después de su fecha límite",
		),
	],
	filterSuggestions: {
		fills: [
			"facturas de Cazuela Azul de más de $1,000",
			"facturas vencidas",
			"lo que pagamos en agosto",
			"facturas entre 200 y 1,000 dólares de la semana pasada",
		],
		holds: [
			"las facturas de limpieza del mes pasado",
			"facturas de alrededor de 500 dólares",
		],
		nothing: [
			"¿cuánto debemos en total?",
			"¿quién es nuestro mejor proveedor?",
		],
	},
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
	tags: [
		tag(
			"meals",
			"comidas: comida y bebida, como almuerzo, cena, café, meriendas y catering",
		),
		tag("travel", "viajes: vuelos, hoteles, taxis y trenes"),
		tag(
			"office",
			"oficina: lo que mantiene el negocio en marcha, como artículos, equipos, software, hosting, reparaciones, limpieza y ventanas, imprenta, mensajería, nómina y recursos humanos, asesoría legal y seguros",
		),
		tag(
			"client",
			"facturable a un cliente, o gastado con un cliente, cuando la solicitud lo dice con certeza, no cuando dice quizás",
		),
	],
	cardCommands: {
		verbs: [
			"quite",
			"quita",
			"quitar",
			"borre",
			"borra",
			"borrar",
			"elimine",
			"elimina",
			"eliminar",
			"anule",
			"anula",
			"anular",
			"cancele",
			"cancela",
			"cancelar",
			"cambie",
			"cambia",
			"cambiar",
			"mueva",
			"mueve",
			"mover",
			"pase",
			"pasa",
			"deshaga",
			"deshaz",
			"envíe",
			"envía",
			"enviar",
			"reenvíe",
			"reenvía",
			"reenviar",
			"mande",
			"manda",
			"mandar",
		],
		references: [
			"el gasto",
			"del gasto",
			"ese gasto",
			"este gasto",
			"los gastos",
			"la factura",
			"esa factura",
			"esta factura",
			"las facturas",
		],
	},
	cardJoiners: { or: ["o", "u"], and: ["y", "e"] },

	cardSuggestions: {
		fills: [
			"almuerzo con Cazuela Azul ayer, $86.40",
			"taxi de Rumbo Claro con un cliente el viernes, 64 dólares",
			"café del Cafetal hoy, $18.50",
		],
		holds: [
			"almuerzo con los de limpieza ayer, $40",
			"tóner de Tintaverde el viernes pasado, $120",
			"mensajería Pieveloz, 300 pesos",
		],
		nothing: ["¿cuánto gastamos en almuerzos?", "borre el taxi de ayer"],
	},
};
