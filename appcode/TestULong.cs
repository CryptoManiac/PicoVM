/**
 * Very, very, very simple testing program. Conditional jumps, etc. aren't supported yet.
 */

using System;
using System.Collections.Generic;
using System.Text;

namespace SimpleApp
{
    class TestULong
    {
        static void Main(string[] args)
        {
            ulong e = ulong.MaxValue;
            Console.WriteLine(e);
            Console.WriteLine(e / 2);
        }
    }
}
