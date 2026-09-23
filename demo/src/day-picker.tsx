import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { CalendarCopy } from "./content/types.ts";

// Days are ISO strings, YYYY-MM-DD, and their arithmetic runs in UTC.
function dateOf(iso: string): Date {
	return new Date(`${iso}T00:00:00Z`);
}

function isoOf(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
	const date = dateOf(iso);
	date.setUTCDate(date.getUTCDate() + days);
	return isoOf(date);
}

/** The same day of another month, or that month's last day when it is shorter. */
function addMonths(iso: string, months: number): string {
	const date = dateOf(iso);
	const day = date.getUTCDate();
	date.setUTCDate(1);
	date.setUTCMonth(date.getUTCMonth() + months);
	const last = new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
	).getUTCDate();
	date.setUTCDate(Math.min(day, last));
	return isoOf(date);
}

/** Today on the person's own calendar. */
function today(): string {
	const now = new Date();
	return isoOf(
		new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
	);
}

/** The month's weeks, each seven days, padded with the days around it. */
function weeksOf(month: string, weekStart: number): string[][] {
	const first = `${month.slice(0, 7)}-01`;
	const start = addDays(
		first,
		-((dateOf(first).getUTCDay() - weekStart + 7) % 7),
	);
	const weeks: string[][] = [];
	for (let day = start; day.slice(0, 7) <= month.slice(0, 7); ) {
		const week = Array.from({ length: 7 }, (_, i) => addDays(day, i));
		weeks.push(week);
		day = addDays(day, 7);
	}
	return weeks;
}

const KEYS: Record<string, (iso: string) => string> = {
	ArrowLeft: (iso) => addDays(iso, -1),
	ArrowRight: (iso) => addDays(iso, 1),
	ArrowUp: (iso) => addDays(iso, -7),
	ArrowDown: (iso) => addDays(iso, 7),
	PageUp: (iso) => addMonths(iso, -1),
	PageDown: (iso) => addMonths(iso, 1),
};

function Chevron({ back }: { back?: boolean }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			width="16"
			height="16"
			className="chevron"
		>
			<path
				d={back ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
			/>
		</svg>
	);
}

/**
 * A day field's control: a button that shows the day and opens a calendar
 * under it. The arrow keys move through the days, Page Up and Page Down
 * through the months, Enter picks, and Escape or a click outside closes it
 * with the focus back on the button.
 */
export function DayPicker({
	labelId,
	value,
	onChange,
	copy,
	locale,
	format,
}: {
	/** The id of the field's visible label, which names the button. */
	labelId: string;
	value: string | undefined;
	onChange: (value: string | undefined) => void;
	copy: { pickDay: string; calendar: CalendarCopy };
	locale: string;
	format: (iso: string) => string;
}) {
	const id = useId();
	const [open, setOpen] = useState(false);
	// The day that holds the focus inside the calendar; its month is the one shown.
	const [active, setActive] = useState(() => value ?? today());
	const moveFocus = useRef(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const dialog = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open || !moveFocus.current) return;
		moveFocus.current = false;
		dialog.current
			?.querySelector<HTMLButtonElement>(`[data-day="${active}"]`)
			?.focus();
	});

	useEffect(() => {
		if (!open) return;
		function outside(event: PointerEvent) {
			const target = event.target as Node;
			if (
				dialog.current?.contains(target) ||
				trigger.current?.contains(target)
			) {
				return;
			}
			setOpen(false);
		}
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [open]);

	function close() {
		setOpen(false);
		trigger.current?.focus();
	}

	function pick(day: string | undefined) {
		onChange(day);
		close();
	}

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key === "Escape") {
			event.preventDefault();
			close();
			return;
		}
		const move = KEYS[event.key];
		if (!move || !(event.target as HTMLElement).dataset.day) return;
		event.preventDefault();
		moveFocus.current = true;
		setActive(move(active));
	}

	const weekStart = locale.startsWith("en") ? 0 : 1;
	const weeks = weeksOf(active, weekStart);
	const long = new Intl.DateTimeFormat(locale, {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
	const weekday = new Intl.DateTimeFormat(locale, {
		weekday: "short",
		timeZone: "UTC",
	});
	const title = new Intl.DateTimeFormat(locale, {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(dateOf(active));
	const now = today();

	return (
		<div className="day-picker">
			<button
				ref={trigger}
				id={id}
				type="button"
				className="day-trigger"
				data-empty={value === undefined || undefined}
				aria-labelledby={`${labelId} ${id}`}
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => {
					if (open) {
						setOpen(false);
						return;
					}
					setActive(value ?? today());
					moveFocus.current = true;
					setOpen(true);
				}}
			>
				{value ? format(value) : copy.pickDay}
			</button>
			{open && (
				// The keys the calendar handles reach it from the buttons inside.
				<div
					ref={dialog}
					role="dialog"
					aria-label={copy.calendar.label}
					className="calendar"
					onKeyDown={onKeyDown}
				>
					<div className="calendar-head">
						<button
							type="button"
							className="calendar-step"
							aria-label={copy.calendar.previous}
							onClick={() => setActive(addMonths(active, -1))}
						>
							<Chevron back />
						</button>
						<p className="calendar-title" aria-live="polite">
							{title}
						</p>
						<button
							type="button"
							className="calendar-step"
							aria-label={copy.calendar.next}
							onClick={() => setActive(addMonths(active, 1))}
						>
							<Chevron />
						</button>
					</div>
					<table className="calendar-days">
						<thead>
							<tr>
								{weeks[0]?.map((day) => (
									<th key={day} scope="col" abbr={weekday.format(dateOf(day))}>
										{weekday.format(dateOf(day)).slice(0, 2)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{weeks.map((week) => (
								<tr key={week[0]}>
									{week.map((day) => (
										<td key={day}>
											<button
												type="button"
												className="calendar-day"
												data-day={day}
												data-outside={
													day.slice(0, 7) !== active.slice(0, 7) || undefined
												}
												tabIndex={day === active ? 0 : -1}
												aria-label={long.format(dateOf(day))}
												aria-pressed={day === value}
												aria-current={day === now ? "date" : undefined}
												onClick={() => pick(day)}
											>
												{Number(day.slice(8))}
											</button>
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
					{value !== undefined && (
						<button
							type="button"
							className="calendar-clear"
							onClick={() => pick(undefined)}
						>
							{copy.calendar.clear}
						</button>
					)}
				</div>
			)}
		</div>
	);
}
