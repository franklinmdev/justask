import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { RequestBox, type RequestBoxProps } from "./request-box.tsx";
import type { UseSearch } from "./use-search.ts";

export type SearchBoxProps = RequestBoxProps & {
	search: UseSearch<unknown>;
};

/**
 * The request box: a search input the person types into. Enter calls the
 * handler at once, and never submits a surrounding form.
 */
export function SearchBox({ search, ...props }: SearchBoxProps) {
	return <RequestBox flow={search} {...props} />;
}

export type SearchItemProps<T> = Omit<
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
 * The item: the one the person meant, as a button that hands it to the
 * app, or nothing. A polite live region, so the item is announced when it
 * appears, and busy while the next answer is on its way. It follows the box
 * in the DOM, so Tab moves from the box to the item.
 */
export function SearchItem<T>({
	search,
	children,
	itemProps,
	...props
}: SearchItemProps<T>) {
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
	const empty = search.answered && search.item === null;
	return (
		<div {...props} role="status" aria-busy={search.loading}>
			{empty && children}
		</div>
	);
}
