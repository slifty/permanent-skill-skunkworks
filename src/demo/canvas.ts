import { encode } from "jpeg-js";

export type Color = readonly [number, number, number];

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Peak {
	left: number;
	right: number;
	base: number;
	apex: number;
}

const CHANNELS = 4;
const OPAQUE = 255;
const QUALITY = 85;

export class Canvas {
	public readonly width: number;
	public readonly height: number;
	private readonly pixels: Buffer;

	public constructor(width: number, height: number, background: Color) {
		this.width = width;
		this.height = height;
		this.pixels = Buffer.alloc(width * height * CHANNELS);
		this.rect({ x: 0, y: 0, width, height }, background);
	}

	public rect({ x, y, width, height }: Box, color: Color): this {
		for (
			let row = Math.max(0, y);
			row < Math.min(this.height, y + height);
			row += 1
		) {
			for (
				let column = Math.max(0, x);
				column < Math.min(this.width, x + width);
				column += 1
			) {
				this.set(column, row, color);
			}
		}
		return this;
	}

	public circle(
		centerX: number,
		centerY: number,
		radius: number,
		color: Color,
	): this {
		for (let row = centerY - radius; row <= centerY + radius; row += 1) {
			for (
				let column = centerX - radius;
				column <= centerX + radius;
				column += 1
			) {
				if ((column - centerX) ** 2 + (row - centerY) ** 2 <= radius ** 2) {
					this.set(column, row, color);
				}
			}
		}
		return this;
	}

	public triangle(
		{ left, right, base, apex: apexY }: Peak,
		color: Color,
	): this {
		const middle = (left + right) / 2;
		for (let row = apexY; row <= base; row += 1) {
			const spread = ((row - apexY) / (base - apexY)) * ((right - left) / 2);
			this.rect(
				{
					x: Math.round(middle - spread),
					y: row,
					width: Math.round(spread * 2),
					height: 1,
				},
				color,
			);
		}
		return this;
	}

	public person(x: number, groundY: number, shirt: Color): this {
		this.circle(x, groundY - 130, 22, [224, 172, 130]);
		this.rect({ x: x - 25, y: groundY - 105, width: 50, height: 70 }, shirt);
		this.rect(
			{ x: x - 22, y: groundY - 35, width: 18, height: 35 },
			[40, 40, 60],
		);
		this.rect(
			{ x: x + 4, y: groundY - 35, width: 18, height: 35 },
			[40, 40, 60],
		);
		return this;
	}

	public toJpeg(): Buffer {
		return encode(
			{ data: this.pixels, width: this.width, height: this.height },
			QUALITY,
		).data;
	}

	private set(column: number, row: number, [red, green, blue]: Color): void {
		if (column < 0 || row < 0 || column >= this.width || row >= this.height) {
			return;
		}
		const offset = (row * this.width + column) * CHANNELS;
		this.pixels[offset] = red;
		this.pixels[offset + 1] = green;
		this.pixels[offset + 2] = blue;
		this.pixels[offset + 3] = OPAQUE;
	}
}
