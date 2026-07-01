"use client";

import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ProductImage } from "@/components/store/product-image";
import type { ProductCardDto } from "@/lib/search-client";

/**
 * List product card — ported from the Metronic store-client `Card3`, cart
 * context removed and wired to our `ProductCardDto`. Clicking the title or
 * image opens the quick-view modal.
 */
export function ProductCardList({
  product,
  onOpen,
}: {
  product: ProductCardDto;
  onOpen: (id: string) => void;
}) {
  const open = () => onOpen(product.id);

  return (
    <Card>
      <CardContent className="flex items-center flex-wrap justify-between p-2 pe-5 gap-4.5">
        <div className="flex items-center gap-3.5 min-w-0">
          <Card className="flex items-center justify-center bg-accent/50 h-[70px] w-[90px] shadow-none shrink-0 overflow-hidden">
            <ProductImage
              src={product.image}
              alt={product.title}
              width={product.imageWidth}
              height={product.imageHeight}
              onClick={open}
              className="h-[70px] w-full object-contain cursor-pointer"
            />
          </Card>

          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-2.5 -mt-1">
              <button
                type="button"
                onClick={open}
                className="hover:text-primary text-sm font-medium text-mono leading-5.5 cursor-pointer text-start truncate"
              >
                {product.title}
              </button>
              {!product.inStock && (
                <Badge size="sm" variant="secondary" className="uppercase shrink-0">
                  Out of stock
                </Badge>
              )}
            </div>

            <div className="flex items-center flex-wrap gap-3">
              {product.rating !== undefined && (
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
              )}
              <div className="flex items-center flex-wrap gap-2 lg:gap-4">
                {product.brand && (
                  <span className="text-xs font-normal text-secondary-foreground">
                    Brand:{" "}
                    <span className="text-xs font-medium text-foreground">
                      {product.brand}
                    </span>
                  </span>
                )}
                {product.category && (
                  <span className="text-xs font-normal text-secondary-foreground">
                    Category:{" "}
                    <span className="text-xs font-medium text-foreground">
                      {product.category}
                    </span>
                  </span>
                )}
                {product.reviews !== undefined && (
                  <span className="text-xs font-normal text-secondary-foreground">
                    {product.reviews} reviews
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {product.price !== undefined && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-sm font-medium text-mono">
              ${product.price.toFixed(2)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
