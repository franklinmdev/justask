import {
	type ComponentPropsWithoutRef,
	type ReactNode,
	useEffect,
	useRef,
} from "react";
import type { Fields, FieldValue } from "../filter.ts";
import { RequestBox, type RequestBoxProps } from "./request-box.tsx";
import type { UseFilter } from "./use-filter.ts";

export type FilterBoxProps = RequestBoxProps & {
	filter: Pick<UseFilter<Fields>, "request" | "setRequest" | "submit">;
};

/**
 * The request box: a search input the person types into. Enter calls the
 * handler at once, and never submits a surrounding form.
 */
export function FilterBox({ filter, ...props }: FilterBoxProps) {
	return <RequestBox flow={filter} {...props} />;
}

export type FilterFieldsProps<F extends Fields> = Omit<
	ComponentPropsWithoutRef<"div">,
	"role" | "children"
> & {
	filter: UseFilter<F>;
	/** The list's accessible name, such as "Filters to apply". */
	label: string;
	/** Renders each field's proposed value, in the host app's own words. */
	render: { [K in keyof F]: (value: FieldValue<F[K]>) => ReactNode };
	/** The accessible name of the button that removes one field's filter, such as "Remove the vendor filter". */
	removeLabel: (name: keyof F & string) => string;
	/** What the remove button shows, such as an icon. Its text is `removeLabel` when left out. */
	removeContent?: ReactNode;
	/** Props for each list item, such as its class name. */
	itemProps?: Omit<ComponentPropsWithoutRef<"li">, "children">;
	/** Props for each remove button, such as its class name. */
	removeProps?: Omit<
		ComponentPropsWithoutRef<"button">,
		"type" | "onClick" | "children" | "aria-label"
	>;
};

/**
 * The proposed filters: one list item per filled field, in the order the
 * fields are declared, each with a button that removes it before Confirm. A
 * held field is not listed, exactly as one the request never mentioned. A
 * polite live region, so the filters are announced when they appear, and busy
 * while the next answer is on its way. It follows the box in the DOM, so Tab
 * moves from the box to the filters, then on to Confirm.
 */
export function FilterFields<F extends Fields>({
	filter,
	label,
	render,
	removeLabel,
	removeContent,
	itemProps,
	removeProps,
	...props
}: FilterFieldsProps<F>) {
	const region = useRef<HTMLDivElement>(null);
	const buttons = useRef(new Map<string, HTMLButtonElement>());
	// The filter to focus once a removal has rendered: the next one, or the list itself.
	const focusNext = useRef<string | null>(null);
	const names = Object.keys(filter.value ?? {}) as (keyof F & string)[];

	useEffect(() => {
		if (focusNext.current === null) return;
		const next = buttons.current.get(focusNext.current);
		focusNext.current = null;
		(next ?? region.current)?.focus();
	});

	function removeAt(index: number) {
		const name = names[index];
		if (name === undefined) return;
		focusNext.current = names[index + 1] ?? names[index - 1] ?? "";
		filter.remove(name);
	}

	return (
		<div
			{...props}
			ref={region}
			tabIndex={-1}
			role="status"
			aria-busy={filter.loading}
		>
			{names.length > 0 && (
				<ul aria-label={label}>
					{names.map((name, index) => {
						const value = filter.value?.[name] as FieldValue<F[typeof name]>;
						return (
							<li key={name} {...itemProps}>
								<span>{render[name](value)}</span>
								<button
									{...removeProps}
									ref={(button) => {
										if (button) buttons.current.set(name, button);
										else buttons.current.delete(name);
									}}
									type="button"
									aria-label={removeLabel(name)}
									onClick={() => removeAt(index)}
								>
									{removeContent ?? removeLabel(name)}
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

export type FilterEmptyProps = Omit<ComponentPropsWithoutRef<"div">, "role"> & {
	filter: Pick<UseFilter<Fields>, "answered" | "error" | "loading" | "result">;
};

/**
 * The empty state: its children show once an answer came back that fills no
 * field. A failed provider shows it too, since a held filter looks the same
 * whatever the reason. A polite live region, so the empty state is announced.
 */
export function FilterEmpty({ filter, children, ...props }: FilterEmptyProps) {
	const filled = filter.error ? {} : (filter.result?.value ?? {});
	const empty = filter.answered && Object.keys(filled).length === 0;
	return (
		<div {...props} role="status" aria-busy={filter.loading}>
			{empty && children}
		</div>
	);
}

export type FilterConfirmProps = Omit<
	ComponentPropsWithoutRef<"button">,
	"type" | "onClick" | "disabled" | "aria-disabled"
> & {
	filter: Pick<UseFilter<Fields>, "ready" | "confirm">;
};

/**
 * Confirm: hands the proposed filters to the app. With nothing to confirm it
 * stays focusable and says so with `aria-disabled`, so a keyboard user who
 * just confirmed keeps their place.
 */
export function FilterConfirm({ filter, ...props }: FilterConfirmProps) {
	return (
		<button
			{...props}
			type="button"
			aria-disabled={!filter.ready}
			onClick={filter.confirm}
		/>
	);
}
