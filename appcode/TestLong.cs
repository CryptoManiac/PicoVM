/**
 * Very, very, very simple testing program. Conditional jumps, etc. aren't supported yet.
 */

using System;
using System.Collections.Generic;
using System.Text;

namespace SimpleApp
{
    class TestLong
    {
        static void Main(string[] args)
        {
            long e = long.MaxValue;
            Console.WriteLine(e);

            e = long.MinValue;
            Console.WriteLine(e);

            Console.WriteLine(e / 2);
        }
    }
}
