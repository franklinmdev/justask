import type { ComponentPropsWithoutRef, KeyboardEvent } from "react";

export type RequestBoxProps = Omit<
	ComponentPropsWithoutRef<"input">,
	"type" | "value" | "defaultValue" | "onChange" | "children" | "aria-label"
> & {
	/** The box's accessible name, such as "Find a vendor". */
	label: string;
};

/** The part of a flow's hook the request box drives. */
export type RequestFlow = {
	request: string;
	setRequest: (request: string) => void;
	submit: () => void;
};

/**
 * The request box every flow shares: a search input the person types into.
 * Enter calls the handler at once, and never submits a surrounding form.
 */
export function RequestBox({
	flow,
	label,
	onKeyDown,
	...props
}: RequestBoxProps & { flow: RequestFlow }) {
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
		flow.submit();
	}

	return (
		<input
			aria-label={label}
			{...props}
			type="search"
			value={flow.request}
			onChange={(event) => flow.setRequest(event.target.value)}
			onKeyDown={handleKeyDown}
		/>
	);
}
