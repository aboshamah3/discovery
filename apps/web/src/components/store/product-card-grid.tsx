"use client";

import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ProductImage } from "@/components/store/product-image";
import type { ProductCardDto } from "@/lib/search-client";

/**
 * Grid product card — ported from the Metronic store-client `Card2`, with the
 * cart/checkout context and "Add to Cart" removed (YAGNI, constitution V) and
 * static data replaced by our `ProductCardDto`. Clicking the card opens the
 * quick-view modal.
 */
export function ProductCardGrid({
  product,
  onOpen,
}: {
  product: ProductCardDto;
  onOpen: (id: string) => void;
}) {
  const open = () => onOpen(product.id);

  return (
    <Card>
      <CardContent className="flex flex-col justify-between p-2.5 gap-4">
        <div className="mb-2.5">
          <Card className="flex items-center justify-center relative bg-accent/50 w-full h-[180px] mb-4 shadow-none overflow-hidden">
            {!product.inStock && (
              <Badge
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2 uppercase"
              >
                Out of stock
              </Badge>
            )}
            <ProductImage
              src={product.image}
              alt={product.title}
              width={product.imageWidth}
              height={product.imageHeight}
              onClick={open}
              className="h-[180px] w-full object-cover shrink-0 cursor-pointer"
            />
          </Card>

          <button
            type="button"
            onClick={open}
            className="hover:text-primary text-sm font-medium text-mono px-2.5 leading-5.5 block cursor-pointer text-start w-full"
          >
            {product.title}
          </button>

          {product.brand && (
            <div className="px-2.5 mt-1.5">
              <Badge size="sm" variant="secondary" appearance="light">
                {product.brand}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex items-center flex-wrap justify-between gap-3 px-2.5 pb-1">
          {product.rating !== undefined ? (
            <Badge
              size="sm"
              variant="warning"
              shape="circle"
              className="rounded-full gap-1"
            >
              <Star
                className="text-white -mt-0.5"
                style={{ fill: "currentColor" }}
              />{" "}
              {product.rating.toFixed(1)}
            </Badge>
          ) : (
            <span />
          )}

          {product.price !== undefined && (
            <span className="text-sm font-medium text-mono">
              ${product.price.toFixed(2)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
