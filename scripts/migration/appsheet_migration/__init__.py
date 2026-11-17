"""AppSheet workbook -> HRM database import (SQL generator).

Layers, in the order data flows through them:

    xlsx_reader  ->  sheets/*  ->  models  ->  sql/*  ->  one .sql file
    (raw cells)      (clean + map)  (typed)     (statements)

`config` holds every tweakable constant and mapping; `pipeline` wires the layers together.
"""
