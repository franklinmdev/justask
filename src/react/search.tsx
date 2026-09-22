import type { ComponentPropsWithoutRef, KeyboardEvent, ReactNode } from "react";
import type { UseSearch } from "./use-search.ts";

export type SearchBoxProps = Omit<
	ComponentPropsWithoutRef<"input">,
	"type" | "value" | "defaultValue" | "onChange" | "children"
> & {
	search: UseSearch<unknown>;
	/** The box's accessible name, such as "Find a vendor". */
	label: string;
};

/**
 * The request box: a search input the person types into. Enter calls the
 * handler at once, and never submits a surrounding form.
 */
export function SearchBox({
	search,
	label,
	onKeyDown,
	...props
}: SearchBoxProps) {
	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		onKeyDown?.(event);
		if (
			event.defaultPrevented ||
			event.key !== "Enter" ||
			event.nativeEvent.isComposing
		) {
			return;
		}
		event.preventDefault();
		search.submit();
	}

	return (
		<input
			aria-label={label}
			{...props}
			type="search"
			value={search.request}
			onChange={(event) => search.setRequest(event.target.value)}
			onKeyDown={handleKeyDown}
		/>
	);
}

export type SearchResultsProps<T> = Omit<
	ComponentPropsWithoutRef<"div">,
	"role" | "children"
> & {
	search: UseSearch<T>;
	/** Renders the item inside the button that chooses it. */
	children: (item: T) => ReactNode;
	/** Props for the button that chooses the item, such as its class name. */
	itemProps?: Omit<
		ComponentPropsWithoutRef<"button">,
		"type" | "onClick" | "children"
	>;
};

/**
 * The results: the item the person meant, as a button that hands it to the
 * app, or nothing. A polite live region, so the item is announced when it
 * appears, and busy while the next answer is on its way. It follows the box
 * in the DOM, so Tab moves from the box to the item.
 */
export function SearchResults<T>({
	search,
	children,
	itemProps,
	...props
}: SearchResultsProps<T>) {
	const { item } = search;
	return (
		<div {...props} role="status" aria-busy={search.loading}>
			{item !== null && (
				<button {...itemProps} type="button" onClick={search.choose}>
					{children(item)}
				</button>
			)}
		</div>
	);
}

export type SearchEmptyProps = Omit<ComponentPropsWithoutRef<"div">, "role"> & {
	search: UseSearch<unknown>;
};

/**
 * The empty state: its children show once an answer came back with no item.
 * A failed provider shows it too, since a held search looks the same whatever
 * the reason. A polite live region, so the empty state is announced.
 */
export function SearchEmpty({ search, children, ...props }: SearchEmptyProps) {
	const empty =
		search.answered && search.item === null && search.request.trim() !== "";
	return (
		<div {...props} role="status" aria-busy={search.loading}>
			{empty && children}
		</div>
	);
}
