/**
 * Very, very, very simple testing program. Conditional jumps, argument access, arithmetics, etc. aren't supported yet.
 */

using System;
using System.Collections.Generic;
using System.Text;

namespace SimpleApp
{
    class Program
    {
        static void Main(string[] args)
        {
/*
			string message = "Hello, world!";
            Console.WriteLine(message);
*/

			int a = -1;
			int b = 2;
			int c = 3;
			int d = 8;
			
			int e = (a + b) * c - d;

			Console.WriteLine(e);

            a = 4;
            b = 2;
            c = 6;
            d = -8;

            e = (a + c) * d - b;

			Console.WriteLine(e);

            a = -250000;
            d = 1;
            e = (a - c) * d - b;

			Console.WriteLine(e);           
        }
    }
}
