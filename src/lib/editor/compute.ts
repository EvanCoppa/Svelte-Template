/**
 * The scratch-paper calculator behind a note.
 *
 * A note is paper you can do arithmetic on: name a number, use it a line
 * later, total a column, convert a measurement. Every one of those is
 * deterministic, so none of it involves a model — asking one to multiply is
 * slower, costlier and less correct than doing it here (docs/antinote-in-notes.md).
 *
 * Pure on purpose, like `$lib/notes` next door: no `$app/*` imports, no DOM,
 * so it runs in a node test. The whole body is recomputed on every keystroke
 * and the results are thrown away — nothing here ever writes to a note. That
 * is the rule the feature is built on: the body stays exactly what was typed,
 * so `noteLabel()`, `noteMatches()` and `notesToMarkdown()` keep working on
 * text nobody rewrote behind the author's back.
 *
 * **Silence is the default.** A line that is not unmistakably arithmetic gets
 * no result at all. Prose is the common case in a note, and a confident wrong
 * answer beside somebody's sentence is worse than no answer, so anything the
 * tokenizer does not fully recognise ends the line as prose.
 */

/** What to show beside one line: a value, a quiet dash, or nothing. */
export type LineResult = { kind: 'value' | 'error'; text: string } | null;

/** The dash an unanswerable line gets — a divide by zero, an unknown name. */
export const ERROR_MARK = '—';

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/**
 * Fixed ratios only. Currency conversion is deliberately absent: live rates
 * would mean a network call on the keystroke path, and a stale rate silently
 * quoted into a proposal is worse than no conversion at all.
 */
type Dimension = 'length' | 'mass';
type UnitDef = { dim: Dimension; ratio: number };

/** Length in metres, mass in grams. */
const UNITS = {
	mm: { dim: 'length', ratio: 0.001 },
	cm: { dim: 'length', ratio: 0.01 },
	m: { dim: 'length', ratio: 1 },
	km: { dim: 'length', ratio: 1000 },
	in: { dim: 'length', ratio: 0.0254 },
	ft: { dim: 'length', ratio: 0.3048 },
	yd: { dim: 'length', ratio: 0.9144 },
	mi: { dim: 'length', ratio: 1609.344 },
	mg: { dim: 'mass', ratio: 0.001 },
	g: { dim: 'mass', ratio: 1 },
	kg: { dim: 'mass', ratio: 1000 },
	t: { dim: 'mass', ratio: 1_000_000 },
	oz: { dim: 'mass', ratio: 28.349523125 },
	lb: { dim: 'mass', ratio: 453.59237 },
	st: { dim: 'mass', ratio: 6350.29318 }
} as const satisfies Record<string, UnitDef>;

/** The units this understands — every key above, and nothing else. */
type UnitName = keyof typeof UNITS;

function isUnitName(value: string): value is UnitName {
	return Object.hasOwn(UNITS, value);
}

/**
 * The words people actually type, mapped onto the canonical symbols above. A
 * Map rather than an object so an arbitrary word can be looked up without
 * widening the table's own type back to `Record<string, …>`.
 */
const UNIT_ALIASES = new Map<string, UnitName>(
	Object.entries({
		millimetre: 'mm',
		millimetres: 'mm',
		millimeter: 'mm',
		millimeters: 'mm',
		centimetre: 'cm',
		centimetres: 'cm',
		centimeter: 'cm',
		centimeters: 'cm',
		metre: 'm',
		metres: 'm',
		meter: 'm',
		meters: 'm',
		kilometre: 'km',
		kilometres: 'km',
		kilometer: 'km',
		kilometers: 'km',
		inch: 'in',
		inches: 'in',
		foot: 'ft',
		feet: 'ft',
		yard: 'yd',
		yards: 'yd',
		mile: 'mi',
		miles: 'mi',
		milligram: 'mg',
		milligrams: 'mg',
		gram: 'g',
		grams: 'g',
		kilogram: 'kg',
		kilograms: 'kg',
		kilo: 'kg',
		kilos: 'kg',
		tonne: 't',
		tonnes: 't',
		ounce: 'oz',
		ounces: 'oz',
		pound: 'lb',
		pounds: 'lb',
		lbs: 'lb',
		stone: 'st'
	} as const satisfies Record<string, UnitName>)
);

function unitFor(word: string): UnitName | null {
	const key = word.toLowerCase();
	if (isUnitName(key)) return key;
	return UNIT_ALIASES.get(key) ?? null;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * A number, plus what kind of number it is. `percent` and `money` change how
 * it combines and how it prints; `unit` also decides what it may be added to.
 */
type Value = {
	n: number;
	unit?: UnitName;
	percent?: boolean;
	/** The symbol a money literal was written with, so the result prints in it. */
	money?: string;
};

class ComputeError extends Error {}

function fail(message: string): never {
	throw new ComputeError(message);
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type Token =
	| { type: 'number'; value: Value }
	| { type: 'word'; value: string }
	| { type: 'op'; value: string };

const OPERATORS = new Set(['+', '-', '*', '/', '^', '(', ')', '%', '×', '÷']);
const CURRENCY = new Set(['$', '€', '£', '¥']);

/**
 * Split one line into tokens, or return null the moment something appears
 * that is not part of an expression — which is what keeps prose silent.
 */
function tokenize(line: string): Token[] | null {
	const tokens: Token[] = [];
	let i = 0;

	while (i < line.length) {
		const char = line[i];

		if (/\s/.test(char)) {
			i += 1;
			continue;
		}

		// A money symbol binds to the number that follows it.
		let money: string | undefined;
		if (CURRENCY.has(char)) {
			money = char;
			i += 1;
			while (i < line.length && /\s/.test(line[i])) i += 1;
			if (!/[\d.]/.test(line[i] ?? '')) return null;
		}

		if (/[\d.]/.test(line[i] ?? '')) {
			// Thousands separators are part of how people write numbers down.
			const match = /^\d[\d,]*(?:\.\d+)?|^\.\d+/.exec(line.slice(i));
			if (!match) return null;
			const n = Number(match[0].replace(/,/g, ''));
			if (!Number.isFinite(n)) return null;
			tokens.push({ type: 'number', value: money ? { n, money } : { n } });
			i += match[0].length;
			continue;
		}

		if (money !== undefined) return null;

		if (/[A-Za-z_]/.test(char)) {
			const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(i));
			if (!match) return null;
			tokens.push({ type: 'word', value: match[0] });
			i += match[0].length;
			continue;
		}

		if (OPERATORS.has(char)) {
			tokens.push({ type: 'op', value: char === '×' ? '*' : char === '÷' ? '/' : char });
			i += 1;
			continue;
		}

		// Punctuation, symbols, anything else: this is a sentence, not a sum.
		return null;
	}

	return tokens;
}

// ---------------------------------------------------------------------------
// Parsing and evaluation
// ---------------------------------------------------------------------------

/**
 * One pass over the tokens, evaluating as it goes. The grammar is small
 * enough that a separate syntax tree would only add a hop:
 *
 *   conversion := sum ('to' unit)?
 *   sum        := product (('+' | '-') product)*
 *   product    := power (('*' | '/') power)*
 *   power      := unary ('^' power)?
 *   unary      := ('-' | '+')? primary
 *   primary    := number unit? '%'? | name | '(' conversion ')'
 *
 * `of` sits outside this, handled by the caller: "8% of 250" reads as one
 * phrase rather than an operator people would ever nest.
 */
class Reader {
	private at = 0;

	constructor(
		private readonly tokens: Token[],
		private readonly scope: Map<string, Value>
	) {}

	peek(): Token | undefined {
		return this.tokens[this.at];
	}

	done(): boolean {
		return this.at >= this.tokens.length;
	}

	private take(): Token | undefined {
		return this.tokens[this.at++];
	}

	private isOp(value: string): boolean {
		const token = this.peek();
		return token?.type === 'op' && token.value === value;
	}

	private isWord(value: string): boolean {
		const token = this.peek();
		return token?.type === 'word' && token.value.toLowerCase() === value;
	}

	conversion(): Value {
		const left = this.sum();
		if (!this.isWord('to')) return left;
		this.take();
		const token = this.take();
		if (token?.type !== 'word') fail('Nothing to convert to.');
		const target = unitFor(token.value);
		if (!target) fail(`${token.value} is not a unit.`);
		return convert(left, target);
	}

	sum(): Value {
		let left = this.product();
		while (this.isOp('+') || this.isOp('-')) {
			const subtracting = this.isOp('-');
			this.take();
			const right = this.product();
			left = add(left, right, subtracting);
		}
		return left;
	}

	private product(): Value {
		let left = this.power();
		while (this.isOp('*') || this.isOp('/')) {
			const dividing = this.isOp('/');
			this.take();
			const right = this.power();
			left = dividing ? divide(left, right) : multiply(left, right);
		}
		return left;
	}

	private power(): Value {
		const base = this.unary();
		if (!this.isOp('^')) return base;
		this.take();
		const exponent = this.power();
		if (exponent.unit) fail('An exponent has no unit.');
		return { ...base, n: base.n ** exponent.n };
	}

	private unary(): Value {
		if (this.isOp('-')) {
			this.take();
			const value = this.unary();
			return { ...value, n: -value.n };
		}
		if (this.isOp('+')) {
			this.take();
			return this.unary();
		}
		return this.primary();
	}

	private primary(): Value {
		return this.postfix(this.base());
	}

	private base(): Value {
		const token = this.take();
		if (!token) fail('The line stops in the middle of a sum.');

		if (token.type === 'op' && token.value === '(') {
			const inner = this.conversion();
			if (!this.isOp(')')) fail('A bracket is left open.');
			this.take();
			return inner;
		}

		if (token.type === 'number') return token.value;

		if (token.type === 'word') {
			// A name someone defined wins over a unit of the same spelling, so
			// `t = 3` means what it says.
			const known = this.scope.get(token.value);
			if (known) return known;
			fail(`${token.value} has no value.`);
		}

		fail('That is not something to calculate.');
	}

	/**
	 * A unit and a percent sign are written after the thing they describe, and
	 * they attach to any value — "12 ft", but also "(10 + 2) ft" and "total%".
	 */
	private postfix(value: Value): Value {
		const next = this.peek();
		if (!value.unit && next?.type === 'word' && !this.scope.has(next.value)) {
			const unit = unitFor(next.value);
			if (unit) {
				this.take();
				value = { ...value, unit };
			}
		}
		if (this.isOp('%')) {
			this.take();
			value = { ...value, percent: true };
		}
		return value;
	}
}

function sameDimension(a: UnitName, b: UnitName): boolean {
	return UNITS[a].dim === UNITS[b].dim;
}

function convert(value: Value, target: UnitName): Value {
	if (!value.unit) fail('There is no unit to convert.');
	if (!sameDimension(value.unit, target)) fail('Those units measure different things.');
	const n = (value.n * UNITS[value.unit].ratio) / UNITS[target].ratio;
	return { n, unit: target };
}

/**
 * Adding a percentage to a plain number is relative — "250 + 8%" is 270, the
 * way a tax line is written down. Two plain numbers add normally, and two
 * measurements add in the units of the one on the left.
 */
function add(left: Value, right: Value, subtract: boolean): Value {
	const sign = subtract ? -1 : 1;

	if (right.percent && !left.percent) {
		return { ...left, n: left.n + (sign * left.n * right.n) / 100 };
	}
	if (left.unit && right.unit) {
		if (!sameDimension(left.unit, right.unit)) fail('Those units measure different things.');
		const rightInLeft = convert(right, left.unit);
		return { ...left, n: left.n + sign * rightInLeft.n };
	}
	if (Boolean(left.unit) !== Boolean(right.unit)) fail('Only one side has a unit.');

	return { ...merge(left, right), n: left.n + sign * right.n };
}

function multiply(left: Value, right: Value): Value {
	if (left.unit && right.unit) fail('Two measurements do not multiply into one.');
	// "250 * 8%" is the fraction, not 250 times 8.
	if (right.percent) return { ...strip(left), n: (left.n * right.n) / 100 };
	if (left.percent) return { ...strip(right), n: (left.n * right.n) / 100 };
	return { ...merge(left, right), n: left.n * right.n };
}

function divide(left: Value, right: Value): Value {
	if (right.n === 0) fail('Divided by zero.');
	if (right.percent) return { ...strip(left), n: (left.n / right.n) * 100 };
	// A measurement over a measurement is a plain ratio.
	if (left.unit && right.unit) {
		if (!sameDimension(left.unit, right.unit)) fail('Those units measure different things.');
		return { n: left.n / convert(right, left.unit).n };
	}
	if (right.unit) fail('Only the divisor has a unit.');
	return { ...merge(left, right), n: left.n / right.n };
}

/** Percentage is a property of an operand, never of the answer. */
function strip(value: Value): Value {
	return { n: value.n, unit: value.unit, money: value.money };
}

/** Money and units survive arithmetic with a plain number. */
function merge(left: Value, right: Value): Value {
	return { n: 0, unit: left.unit ?? right.unit, money: left.money ?? right.money };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatNumber(n: number, decimals?: number): string {
	// Float noise is the one thing certain to make a calculator look broken.
	const rounded = decimals === undefined ? Number(n.toPrecision(12)) : n;
	return rounded.toLocaleString('en-US', {
		minimumFractionDigits: decimals ?? 0,
		maximumFractionDigits: decimals ?? 4
	});
}

function format(value: Value): string {
	if (!Number.isFinite(value.n)) fail('That does not come out to a number.');
	if (value.percent) return `${formatNumber(value.n)}%`;
	if (value.money) return `${value.money}${formatNumber(value.n, 2)}`;
	if (value.unit) return `${formatNumber(value.n)} ${value.unit}`;
	return formatNumber(value.n);
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

/** `name = …`, where the name is one word. Spaces would make `a b` ambiguous. */
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/;
/** A label ending in a colon is scaffolding around the sum: "Total: 3 * 4". */
const LABEL = /^[^:=]{1,40}:\s*(.+)$/;
const AGGREGATE = /^(sum|total|average|avg|mean|count)(?:\s+(lines|words|items))?$/i;

/** The two words that are part of the grammar rather than names. */
const KEYWORDS = new Set(['to', 'of']);

/**
 * Is this line arithmetic at all?
 *
 * **Every word in it must mean something** — a name defined above, a unit, or
 * a keyword — otherwise the line is prose and gets no result and no dash.
 * That is the whole defence against a note full of sentences sprouting
 * dashes: "needs 25 widgets by Friday" has numbers and reads like nothing
 * else, and `widgets` is the tell.
 *
 * The cost of the rule is that `totl * 2` is silent rather than complaining
 * about a typo. That is the right trade: a sentence is far more common in a
 * note than a misspelt variable, and this layer is judged on how well it
 * stays out of the way.
 */
function looksLikeMath(tokens: Token[], scope: Map<string, Value>): boolean {
	return tokens.every(
		(token) =>
			token.type !== 'word' ||
			scope.has(token.value) ||
			unitFor(token.value) !== null ||
			KEYWORDS.has(token.value.toLowerCase())
	);
}

/**
 * A line with no operator in it is a number someone wrote down — "42", "$5",
 * "3 kg". Echoing it back says nothing the line does not already say, so it
 * shows no result, but it is still a value and still counts toward the sum
 * underneath it.
 */
function statesAValue(tokens: Token[]): boolean {
	return !tokens.some(
		(token) =>
			(token.type === 'op' && token.value !== '%') ||
			(token.type === 'word' && KEYWORDS.has(token.value.toLowerCase()))
	);
}

/** Evaluates a fragment, or returns null when it was never arithmetic. */
function evaluateLine(source: string, scope: Map<string, Value>): Value | null {
	const tokens = tokenize(source);
	if (!tokens || tokens.length === 0) return null;
	if (!looksLikeMath(tokens, scope)) return null;
	const reader = new Reader(tokens, scope);
	const value = reader.conversion();
	// Trailing tokens mean the line was only partly arithmetic, which is prose.
	if (!reader.done()) fail('There is more on the line than a sum.');
	return value;
}

/**
 * The numbers directly above a line, stopping at the first blank line — the
 * column of figures a `sum` is written under. A blank line is how a note
 * separates one list from the next, so it is what ends a block.
 */
function blockAbove(values: (Value | null)[], lines: string[], index: number): Value[] {
	const block: Value[] = [];
	for (let i = index - 1; i >= 0; i -= 1) {
		if (lines[i].trim() === '') break;
		const value = values[i];
		if (value) block.push(value);
	}
	return block.reverse();
}

function aggregate(
	word: string,
	over: string | undefined,
	values: (Value | null)[],
	lines: string[],
	index: number,
	body: string
): Value {
	const name = word.toLowerCase();

	if (name === 'count') {
		if (over === 'words') return { n: body.split(/\s+/).filter(Boolean).length };
		if (over === 'lines') return { n: lines.filter((line) => line.trim() !== '').length };
		return { n: blockAbove(values, lines, index).length };
	}

	const block = blockAbove(values, lines, index);
	if (block.length === 0) fail('There are no numbers above this line.');

	const first = block[0];
	const total = block.reduce((sum, value) => {
		if (first.unit) {
			if (!value.unit) fail('Only some of these have units.');
			return sum + convert(value, first.unit).n;
		}
		return sum + value.n;
	}, 0);

	const n = name === 'sum' || name === 'total' ? total : total / block.length;
	return { n, unit: first.unit, money: first.money };
}

/**
 * Every line of a note, answered. The result at index `i` belongs beside line
 * `i` of `body.split('\n')`, so a caller can line them up without re-splitting
 * differently and drifting by one.
 *
 * Variables are resolved in the order they are written: a line sees every
 * assignment above it and none below, which is what makes editing one number
 * update everything under it without a dependency graph to maintain.
 */
export function computeNote(body: string): LineResult[] {
	const lines = body.split('\n');
	const scope = new Map<string, Value>();
	const values: (Value | null)[] = [];
	const results: LineResult[] = [];

	lines.forEach((line, index) => {
		const trimmed = line.trim();
		if (trimmed === '') {
			values.push(null);
			results.push(null);
			return;
		}

		try {
			const assignment = ASSIGNMENT.exec(trimmed);
			if (assignment) {
				const value = evaluateLine(assignment[2], scope);
				if (!value) {
					values.push(null);
					results.push(null);
					return;
				}
				scope.set(assignment[1], value);
				values.push(value);
				results.push({ kind: 'value', text: format(value) });
				return;
			}

			const expression = LABEL.exec(trimmed)?.[1] ?? trimmed;

			const totals = AGGREGATE.exec(expression);
			if (totals) {
				const value = aggregate(totals[1], totals[2]?.toLowerCase(), values, lines, index, body);
				values.push(value);
				results.push({ kind: 'value', text: format(value) });
				return;
			}

			// "8% of 250" — one phrase, not an operator worth nesting.
			const [left, right] = splitOnOf(expression);
			if (right !== undefined) {
				const share = evaluateLine(left, scope);
				const whole = evaluateLine(right, scope);
				if (!share || !whole) {
					values.push(null);
					results.push(null);
					return;
				}
				if (!share.percent) fail('Only a percentage can be "of" something.');
				const value = multiply(whole, share);
				values.push(value);
				results.push({ kind: 'value', text: format(value) });
				return;
			}

			const tokens = tokenize(expression);
			if (!tokens || tokens.length === 0 || !looksLikeMath(tokens, scope)) {
				values.push(null);
				results.push(null);
				return;
			}

			const reader = new Reader(tokens, scope);
			const value = reader.conversion();
			if (!reader.done()) fail('There is more on the line than a sum.');

			values.push(value);
			results.push(statesAValue(tokens) ? null : { kind: 'value', text: format(value) });
		} catch (cause) {
			// A line that looked like arithmetic and did not work out says so
			// quietly. Anything that was never arithmetic never gets here.
			if (cause instanceof ComputeError) {
				values.push(null);
				results.push({ kind: 'error', text: ERROR_MARK });
				return;
			}
			throw cause;
		}
	});

	return results;
}

/** `8% of 250` → the two halves. Undefined right when the line has no `of`. */
function splitOnOf(expression: string): [string, string | undefined] {
	const match = /^(.+?)\s+of\s+(.+)$/i.exec(expression);
	return match ? [match[1], match[2]] : [expression, undefined];
}
